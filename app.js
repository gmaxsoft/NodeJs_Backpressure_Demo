const fs = require('fs');
const { pipeline } = require('stream/promises');
const path = require('path');

// Konfiguracja
const DEFAULT_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const DEFAULT_BUFFER_SIZE = 64 * 1024; // 64KB
const DEFAULT_SLOW_DELAY = 10; // ms opóźnienia przy wolnym zapisie

/**
 * Monitoruje zużycie pamięci i loguje statystyki
 */
function logMemoryUsage(label) {
  const usage = process.memoryUsage();
  console.log(`\n📊 ${label}:`);
  console.log(`   RSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   External: ${(usage.external / 1024 / 1024).toFixed(2)} MB`);
}

/**
 * CZĘŚĆ 1: DEMONSTRACJA PROBLEMU BACKPRESSURE
 * 
 * Problem: Gdy szybko czytamy z pliku i wolno zapisujemy, bufor może się przepełnić.
 * Bez obsługi backpressure, Node.js będzie przechowywał wszystkie dane w pamięci,
 * co może prowadzić do problemów z pamięcią.
 */
async function demonstrateBackpressureProblem(inputFile, outputFile, slowMode = false) {
  console.log('\n🔴 CZĘŚĆ 1: Problem backpressure');
  console.log('=====================================');
  console.log(`Plik wejściowy: ${inputFile}`);
  console.log(`Plik wyjściowy: ${outputFile}`);
  console.log(`Tryb wolny: ${slowMode ? 'TAK' : 'NIE'}`);
  
  logMemoryUsage('Pamięć przed rozpoczęciem');

  const startTime = Date.now();
  
  // Tworzymy strumień odczytu - SZYBKI
  const readStream = fs.createReadStream(inputFile, {
    highWaterMark: DEFAULT_BUFFER_SIZE // Rozmiar bufora wewnętrznego
  });

  // Tworzymy strumień zapisu - WOLNY (symulowany przez opóźnienie)
  const writeStream = fs.createWriteStream(outputFile, {
    highWaterMark: DEFAULT_BUFFER_SIZE
  });

  let bytesRead = 0;
  let bytesWritten = 0;
  let bufferBackpressure = 0;

  // Jeśli tryb wolny, używamy Transform stream do symulacji opóźnienia
  let actualWriteStream = writeStream;
  if (slowMode) {
    const Transform = require('stream').Transform;
    const slowTransform = new Transform({
      transform(chunk, encoding, callback) {
        bytesWritten += chunk.length;
        // Symulacja wolnego zapisu - dodajemy opóźnienie
        setTimeout(() => {
          callback(null, chunk);
        }, DEFAULT_SLOW_DELAY);
      }
    });
    
    // Pipe przez slow transform do write stream
    slowTransform.pipe(writeStream);
    actualWriteStream = slowTransform;
  }

  // Monitorowanie problemu backpressure
  readStream.on('data', (chunk) => {
    bytesRead += chunk.length;
    
    // Sprawdzamy, czy bufor zapisu jest pełny (backpressure)
    if (!actualWriteStream.write(chunk)) {
      bufferBackpressure++;
      // Logujemy tylko co 100 eventów, aby nie zaśmiecać konsoli
      if (bufferBackpressure === 1 || bufferBackpressure % 100 === 0) {
        console.log(`⚠️  Backpressure wykryty! Bufor zapisu pełny (event #${bufferBackpressure})`);
        console.log(`   Przerwano odczyt, czekamy na opróżnienie bufora...`);
      }
      
      // ZATRZYMY odczyt do momentu, aż bufor zapisu się opróżni
      readStream.pause();
    } else {
      if (!slowMode) {
        bytesWritten += chunk.length;
      }
    }
  });

  // Gdy bufor zapisu jest gotowy na więcej danych
  actualWriteStream.on('drain', () => {
    // Logujemy tylko co 100 eventów
    if (bufferBackpressure % 100 === 0 || bufferBackpressure < 100) {
      console.log(`✅ Bufor zapisu opróżniony. Wznowienie odczytu...`);
    }
    readStream.resume(); // Wznawiamy odczyt
  });

  return new Promise((resolve, reject) => {
    readStream.on('end', () => {
      console.log(`\n✅ Odczyt zakończony: ${(bytesRead / 1024 / 1024).toFixed(2)} MB`);
      actualWriteStream.end();
    });

    writeStream.on('finish', () => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      // Pobieramy rzeczywisty rozmiar zapisanego pliku
      const stats = fs.existsSync(outputFile) ? fs.statSync(outputFile) : null;
      const writtenSize = stats ? stats.size : bytesWritten;
      
      console.log(`\n✅ Zapis zakończony: ${(writtenSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`⏱️  Czas wykonania: ${duration}s`);
      console.log(`⚠️  Liczba wystąpień backpressure: ${bufferBackpressure}`);
      logMemoryUsage('Pamięć po zakończeniu');
      resolve();
    });

    readStream.on('error', reject);
    actualWriteStream.on('error', reject);
    writeStream.on('error', reject);
  });
}

/**
 * CZĘŚĆ 2A: ROZWIĄZANIE Z PIPELINE() - AUTOMATYCZNA OBSŁUGA BACKPRESSURE
 * 
 * pipeline() automatycznie obsługuje backpressure i czyści strumienie.
 * Jest to zalecane podejście w Node.js.
 */
async function solutionWithPipeline(inputFile, outputFile, slowMode = false) {
  console.log('\n🟢 CZĘŚĆ 2A: Rozwiązanie z pipeline()');
  console.log('=====================================');
  console.log(`Plik wejściowy: ${inputFile}`);
  console.log(`Plik wyjściowy: ${outputFile}`);
  console.log(`Tryb wolny: ${slowMode ? 'TAK' : 'NIE'}`);
  
  logMemoryUsage('Pamięć przed rozpoczęciem');

  const startTime = Date.now();

  const readStream = fs.createReadStream(inputFile, {
    highWaterMark: DEFAULT_BUFFER_SIZE
  });

  const writeStream = fs.createWriteStream(outputFile, {
    highWaterMark: DEFAULT_BUFFER_SIZE
  });

  let totalBytes = 0;

  // Monitorowanie przepływu danych
  readStream.on('data', (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes % (10 * 1024 * 1024) === 0) {
      console.log(`   Przetworzono: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
    }
  });

  // Symulacja wolnego zapisu (opcjonalnie)
  if (slowMode) {
    const Transform = require('stream').Transform;
    const slowTransform = new Transform({
      transform(chunk, encoding, callback) {
        setTimeout(() => {
          callback(null, chunk);
        }, DEFAULT_SLOW_DELAY);
      }
    });
    
    // Używamy pipeline z transform stream do symulacji opóźnienia
    await pipeline(readStream, slowTransform, writeStream);
  } else {
    // pipeline automatycznie obsługuje backpressure
    await pipeline(readStream, writeStream);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✅ Pipeline zakończony pomyślnie`);
  console.log(`   Przetworzono: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`⏱️  Czas wykonania: ${duration}s`);
  logMemoryUsage('Pamięć po zakończeniu');
}

/**
 * CZĘŚĆ 2B: ROZWIĄZANIE Z PIPE() - AUTOMATYCZNA OBSŁUGA BACKPRESSURE
 * 
 * pipe() również automatycznie obsługuje backpressure, ale wymaga ręcznego
 * czyszczenia strumieni w przypadku błędów.
 */
async function solutionWithPipe(inputFile, outputFile, slowMode = false) {
  console.log('\n🟢 CZĘŚĆ 2B: Rozwiązanie z pipe()');
  console.log('=====================================');
  console.log(`Plik wejściowy: ${inputFile}`);
  console.log(`Plik wyjściowy: ${outputFile}`);
  console.log(`Tryb wolny: ${slowMode ? 'TAK' : 'NIE'}`);
  
  logMemoryUsage('Pamięć przed rozpoczęciem');

  const startTime = Date.now();

  const readStream = fs.createReadStream(inputFile, {
    highWaterMark: DEFAULT_BUFFER_SIZE // Możemy dostosować rozmiar bufora
  });

  const writeStream = fs.createWriteStream(outputFile, {
    highWaterMark: DEFAULT_BUFFER_SIZE
  });

  let totalBytes = 0;

  readStream.on('data', (chunk) => {
    totalBytes += chunk.length;
    if (totalBytes % (10 * 1024 * 1024) === 0) {
      console.log(`   Przetworzono: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
    }
  });

  // Symulacja wolnego zapisu (opcjonalnie)
  if (slowMode) {
    const Transform = require('stream').Transform;
    const slowTransform = new Transform({
      transform(chunk, encoding, callback) {
        setTimeout(() => {
          callback(null, chunk);
        }, DEFAULT_SLOW_DELAY);
      }
    });
    
    readStream.pipe(slowTransform).pipe(writeStream);
  } else {
    // pipe() automatycznie obsługuje backpressure
    readStream.pipe(writeStream);
  }

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Pipe zakończony pomyślnie`);
      console.log(`   Przetworzono: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(`⏱️  Czas wykonania: ${duration}s`);
      logMemoryUsage('Pamięć po zakończeniu');
      resolve();
    });

    readStream.on('error', (err) => {
      readStream.destroy();
      writeStream.destroy();
      reject(err);
    });

    writeStream.on('error', (err) => {
      readStream.destroy();
      writeStream.destroy();
      reject(err);
    });
  });
}

/**
 * Główna funkcja - parsowanie argumentów CLI i uruchomienie odpowiedniego scenariusza
 */
async function main() {
  const args = process.argv.slice(2);
  const slowMode = args.includes('--slow');
  const solution = args.find(arg => arg.startsWith('--solution='))?.split('=')[1] || 'problem';
  
  const inputFile = path.join(__dirname, 'large.txt');
  const outputFile1 = path.join(__dirname, 'output1.txt');
  const outputFile2 = path.join(__dirname, 'output2.txt');

  // Sprawdzamy, czy plik testowy istnieje
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Plik testowy ${inputFile} nie istnieje!`);
    console.log('💡 Uruchom najpierw: npm run generate-file');
    process.exit(1);
  }

  try {
    switch (solution) {
      case 'problem':
        await demonstrateBackpressureProblem(inputFile, outputFile1, slowMode);
        break;
      case 'pipeline':
        await solutionWithPipeline(inputFile, outputFile2, slowMode);
        break;
      case 'pipe':
        await solutionWithPipe(inputFile, outputFile2, slowMode);
        break;
      case 'all':
        await demonstrateBackpressureProblem(inputFile, outputFile1, slowMode);
        await solutionWithPipeline(inputFile, outputFile2, slowMode);
        break;
      default:
        console.error(`❌ Nieznana opcja: --solution=${solution}`);
        console.log('Dostępne opcje: problem, pipeline, pipe, all');
        process.exit(1);
    }
    
    console.log('\n✅ Wszystkie operacje zakończone pomyślnie!');
  } catch (error) {
    console.error('\n❌ Błąd:', error.message);
    process.exit(1);
  }
}

// Uruchomienie, jeśli plik jest wykonywany bezpośrednio
if (require.main === module) {
  main();
}

module.exports = {
  demonstrateBackpressureProblem,
  solutionWithPipeline,
  solutionWithPipe,
  logMemoryUsage
};
