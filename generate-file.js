const fs = require('fs');
const path = require('path');

/**
 * Skrypt do generowania dużego pliku testowego (100MB)
 * 
 * Używa: fs.writeFileSync('large.txt', 'a'.repeat(100 * 1024 * 1024))
 * 
 * To tworzy plik składający się z 100MB znaku 'a'.
 */
function generateLargeFile() {
  const filePath = path.join(__dirname, 'large.txt');
  const fileSize = 100 * 1024 * 1024; // 100MB
  const chunkSize = 1024 * 1024; // 1MB na raz (aby uniknąć problemów z pamięcią)
  
  console.log('📝 Generowanie pliku testowego...');
  console.log(`   Rozmiar: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Ścieżka: ${filePath}`);
  
  const startTime = Date.now();
  
  // Tworzymy write stream dla lepszej wydajności
  const writeStream = fs.createWriteStream(filePath);
  const chunk = 'a'.repeat(chunkSize);
  const chunksCount = Math.ceil(fileSize / chunkSize);
  
  let written = 0;
  
  return new Promise((resolve, reject) => {
    writeStream.on('error', reject);
    
    writeStream.on('finish', () => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Plik wygenerowany pomyślnie!`);
      console.log(`⏱️  Czas: ${duration}s`);
      
      // Sprawdzamy rzeczywisty rozmiar
      const stats = fs.statSync(filePath);
      console.log(`📊 Rzeczywisty rozmiar: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      resolve();
    });
    
    function writeChunk() {
      if (written < chunksCount) {
        const remaining = fileSize - (written * chunkSize);
        const currentChunkSize = Math.min(chunkSize, remaining);
        
        if (currentChunkSize < chunkSize) {
          // Ostatni chunk może być mniejszy
          const lastChunk = 'a'.repeat(currentChunkSize);
          if (writeStream.write(lastChunk)) {
            written++;
            writeStream.end();
          } else {
            writeStream.once('drain', () => {
              writeStream.end();
            });
          }
        } else {
          const canContinue = writeStream.write(chunk);
          written++;
          
          if (written % 10 === 0) {
            console.log(`   Zapisano: ${(written * chunkSize / 1024 / 1024).toFixed(2)} MB`);
          }
          
          if (!canContinue) {
            // Backpressure - czekamy na drain
            writeStream.once('drain', writeChunk);
          } else {
            // Kontynuujemy asynchronicznie
            setImmediate(writeChunk);
          }
        }
      } else {
        // Wszystkie chunki zapisane, zamykamy strumień
        writeStream.end();
      }
    }
    
    writeChunk();
  });
}

// Uruchomienie
if (require.main === module) {
  generateLargeFile().catch((error) => {
    console.error('❌ Błąd podczas generowania pliku:', error.message);
    process.exit(1);
  });
}

module.exports = { generateLargeFile };
