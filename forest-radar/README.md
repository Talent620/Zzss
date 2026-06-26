# Forest Radar 🛰 — radar leśny bez urządzeń przy celu (RTI)

Rozstawiasz tanie węzły radiowe (ESP32) po obwodzie lasku. Wykrywają i **lokalizują
człowieka, który nic nie nosi** — mierząc, jak jego sylwetka tłumi sygnały między
węzłami (tomografia radiowa). Telefon pokazuje **radar na żywo z odległościami**.

## Zobacz od razu (bez sprzętu)
Otwórz **`radar.html`** w przeglądarce telefonu/komputera. Rusza w trybie
**SYMULACJA**: wirtualny intruz chodzi po działce, a radar go śledzi —
heatmapa, blip „INTRUZ”, pozycja i odległości do 8 węzłów. Przyciski:
- **🚶 SYMULUJ INTRUZA** / **🌲 PUSTY LAS** — porównaj „WYKRYTO RUCH” vs „CZYSTO”.
- **Czułość** — próg detekcji. **PAUZA**.
- Niebieski pierścień = prawdziwa pozycja (demo) — widać, jak blisko trafia radar.

## Silnik + test
```bash
cd forest-radar
node selftest.mjs   # 8 węzłów, 28 łączy: ~2 m błędu, 0 fałszywych alarmów
```
`engine.mjs` — rdzeń RTI (ta sama matematyka co w `radar.html`).

## Budowa w lasku (na żywo)
1. Wgraj `node-firmware/esp32-node.ino` na każdy ESP32, ustawiając unikalny
   `NODE_ID` (0..N-1). Węzeł 0 = HUB (SoftAP + WebSocket do telefonu).
2. Rozstaw **8–12 węzłów po obwodzie** działki (~1 m nad ziemią, LiPo+solar).
3. Telefon łączy się z Wi-Fi huba; `radar.html` w trybie NA ŻYWO pobiera tabelę
   RSSI i podaje `drops[]` do `RTI.step()`. Baseline uczy się w pierwszych ~10 s
   („pusty las”).
4. Każda detekcja może być **podpisana w TEE** (integracja z Aegis) → sądowy log.

Szczegóły nauki, rozstawienia i ograniczeń: **`RESEARCH.md`**.

## Czym to różni się od wszystkiego
Kamera widzi światło; ten radar **widzi zaburzenie pola radiowego** — działa w
ciemności, mgle, przez krzaki, i **nie da się go ominąć bez wyłączenia węzłów**,
bo to sam intruz jest „znacznikiem”. Nie nosi nic — a i tak go widzisz.
