# Backpressure Demo - Demonstracja Problemów i Rozwiązań

## 📚 Opis Projektu

Ten projekt demonstruje problem **backpressure** w Node.js oraz pokazuje różne sposoby jego rozwiązania. Backpressure występuje, gdy strumień produkujący dane (np. odczyt z pliku) działa szybciej niż strumień konsumujący dane (np. zapis do pliku), co może prowadzić do przepełnienia buforów i problemów z pamięcią.

## 🎯 Cele Edukacyjne

1. **Zrozumienie problemu backpressure** - jak szybki odczyt może przepełnić bufor wolnego zapisu
2. **Poznanie rozwiązań** - użycie `pipeline()`, `pipe()` z automatyczną obsługą backpressure
3. **Monitorowanie pamięci** - obserwacja wpływu backpressure na zużycie RAM
4. **Dobór właściwego rozwiązania** - kiedy użyć którego podejścia

## 📋 Wymagania

- Node.js 14.0.0 lub nowszy
- Dostęp do dysku dla utworzenia pliku testowego (~100MB)

## 🚀 Instalacja i Użycie

### 1. Generowanie pliku testowego

Najpierw wygeneruj duży plik testowy (100MB):

```bash
npm run generate-file
```

Lub bezpośrednio:

```bash
node generate-file.js
```

### 2. Uruchomienie demonstracji

#### Problem backpressure (bez automatycznej obsługi)

```bash
npm run start:problem
# lub
node app.js --solution=problem
```

#### Rozwiązanie z pipeline() (automatyczna obsługa)

```bash
npm run start:pipeline
# lub
node app.js --solution=pipeline
```

#### Rozwiązanie z pipe() (automatyczna obsługa)

```bash
npm run start:pipe
# lub
node app.js --solution=pipe
```

#### Wszystkie scenariusze naraz

```bash
npm run start:all
# lub
node app.js --solution=all
```

#### Symulacja wolnego konsumenta (--slow)

Dodaj flagę `--slow`, aby symulować wolny zapis:

```bash
npm run start:slow
# lub
node app.js --slow --solution=problem
```

## 📖 Szczegółowe Wyjaśnienia

### Część 1: Problem Backpressure

**Co się dzieje?**

Gdy szybko czytamy dane z pliku i wolno je zapisujemy, Node.js może gromadzić dane w pamięci. Bez odpowiedniej obsługi backpressure, wszystkie dane mogą zostać załadowane do pamięci, co prowadzi do:

- Nadmiernego zużycia RAM
- Spowolnienia aplikacji
- Potencjalnych awarii z powodu braku pamięci

**Demonstracja:**

W części 1 używamy ręcznej obsługi zdarzeń `drain`, aby pokazać, jak backpressure wpływa na przepływ danych. Kod monitoruje liczbę wystąpień backpressure i loguje je w konsoli.

```javascript
readStream.on('data', (chunk) => {
  if (!writeStream.write(chunk)) {
    // Backpressure! Zatrzymujemy odczyt
    readStream.pause();
  }
});

writeStream.on('drain', () => {
  // Bufor pusty, wznawiamy odczyt
  readStream.resume();
});
```

### Część 2A: Rozwiązanie z pipeline()

**Dlaczego pipeline()?**

`pipeline()` jest zalecanym podejściem w Node.js, ponieważ:

- ✅ Automatycznie obsługuje backpressure
- ✅ Poprawnie czyści strumienie po zakończeniu lub błędzie
- ✅ Obsługuje błędy we wszystkich strumieniach
- ✅ Zwraca Promise, co ułatwia obsługę asynchroniczną

**Przykład:**

```javascript
await pipeline(readStream, writeStream);
```

Pipeline automatycznie:
- Zatrzymuje odczyt, gdy bufor zapisu jest pełny
- Wznawia odczyt, gdy bufor jest gotowy
- Czyści wszystkie strumienie po zakończeniu

### Część 2B: Rozwiązanie z pipe()

**Kiedy użyć pipe()?**

`pipe()` również automatycznie obsługuje backpressure, ale wymaga ręcznej obsługi błędów:

```javascript
readStream.pipe(writeStream);

readStream.on('error', (err) => {
  readStream.destroy();
  writeStream.destroy();
});

writeStream.on('error', (err) => {
  readStream.destroy();
  writeStream.destroy();
});
```

**Uwaga:** `pipe()` nie czyści automatycznie strumieni przy błędach, więc należy to robić ręcznie.

### Monitorowanie Pamięci

Projekt używa `process.memoryUsage()` do monitorowania zużycia pamięci:

- **RSS (Resident Set Size)** - całkowita pamięć przydzielona procesowi
- **Heap Used** - użyta pamięć sterty JavaScript
- **Heap Total** - całkowita przydzielona pamięć sterty
- **External** - pamięć używana przez obiekty C++ (np. buforów strumieni)

**Obserwacje:**

- Bez obsługi backpressure: pamięć może gwałtownie wzrosnąć
- Z automatyczną obsługą: pamięć pozostaje na stałym, niskim poziomie

### Dostosowanie highWaterMark

Parametr `highWaterMark` kontroluje rozmiar bufora wewnętrznego strumienia:

```javascript
const readStream = fs.createReadStream(file, {
  highWaterMark: 64 * 1024 // 64KB
});
```

**Wpływ na backpressure:**

- Większy `highWaterMark` → więcej danych w pamięci, ale mniej operacji I/O
- Mniejszy `highWaterMark` → mniej danych w pamięci, ale więcej operacji I/O
- Dla dużych plików: zalecany jest mniejszy `highWaterMark` (16-64KB)

## 🔧 Opcje CLI

| Opcja | Opis |
|-------|------|
| `--solution=problem` | Uruchom tylko demonstrację problemu (domyślnie) |
| `--solution=pipeline` | Uruchom rozwiązanie z `pipeline()` |
| `--solution=pipe` | Uruchom rozwiązanie z `pipe()` |
| `--solution=all` | Uruchom wszystkie scenariusze |
| `--slow` | Symuluj wolny konsument (dodaje opóźnienie 10ms) |

## 📊 Przykładowe Wyjście

```
🔴 CZĘŚĆ 1: Problem backpressure
=====================================
Plik wejściowy: large.txt
Plik wyjściowy: output1.txt
Tryb wolny: NIE

📊 Pamięć przed rozpoczęciem:
   RSS: 45.23 MB
   Heap Used: 8.45 MB
   Heap Total: 12.34 MB
   External: 0.12 MB

⚠️  Backpressure wykryty! Bufor zapisu pełny (event #1)
   Przerwano odczyt, czekamy na opróżnienie bufora...
✅ Bufor zapisu opróżniony. Wznowienie odczytu...

✅ Odczyt zakończony: 100.00 MB
✅ Zapis zakończony: 100.00 MB
⏱️  Czas wykonania: 2.34s
⚠️  Liczba wystąpień backpressure: 3

📊 Pamięć po zakończeniu:
   RSS: 48.56 MB
   Heap Used: 9.12 MB
   Heap Total: 13.45 MB
   External: 0.15 MB
```

## 🎓 Najlepsze Praktyki

1. **Zawsze używaj `pipeline()` lub `pipe()`** zamiast ręcznej obsługi `data`/`write`
2. **Monitoruj pamięć** podczas pracy z dużymi plikami
3. **Dostosuj `highWaterMark`** w zależności od rozmiaru danych i dostępnej pamięci
4. **Obsługuj błędy** we wszystkich strumieniach
5. **Testuj z realistycznymi danymi** (duże pliki, wolne sieci, itp.)

## 📝 Struktura Projektu

```
backpressure-demo/
├── app.js              # Główny plik z demonstracjami
├── generate-file.js    # Skrypt generujący plik testowy
├── package.json        # Konfiguracja projektu
├── README.md           # Ta dokumentacja
├── large.txt           # Wygenerowany plik testowy (100MB)
├── output1.txt         # Wynik demonstracji problemu
└── output2.txt         # Wynik demonstracji rozwiązania
```

## 🐛 Rozwiązywanie Problemów

### Błąd: "Plik testowy nie istnieje"

```bash
npm run generate-file
```

### Duże zużycie pamięci

- Sprawdź, czy używasz `pipeline()` lub `pipe()`
- Zmniejsz `highWaterMark`
- Sprawdź, czy wszystkie strumienie są prawidłowo zamykane

### Wolne działanie

- To normalne przy flagę `--slow`
- Bez `--slow`, działanie powinno być szybkie
- Sprawdź, czy dysk nie jest przeciążony

## 📚 Dodatkowe Materiały

- [Node.js Streams Documentation](https://nodejs.org/api/stream.html)
- [Backpressure in Node.js](https://nodejs.org/en/docs/guides/backpressuring-in-streams/)
- [Stream Transform](https://nodejs.org/api/stream.html#stream_class_stream_transform)

## 📄 Licencja

ISC

---

**Autor:** Backpressure Demo  
**Wersja:** 1.0.0  
**Data:** 2024
