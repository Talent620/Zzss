# Forest Radar — badania i dlaczego to działa (i jest pionierskie)

## Idea w jednym zdaniu
Rozstaw tanie węzły radiowe po obwodzie lasku. Mierzą **siłę sygnału (RSSI)
każdego łącza** między sobą. Człowiek przechodzący tłumi łącza, których linię
przecina. Z tego, *które* łącza spadły i *o ile*, **rekonstruujesz, GDZIE jest
człowiek — bez żadnego urządzenia przy nim.** To „widzenie przez radio”.

## Na czym to stoi (prior art — uczciwie)
To jest realna nauka, nie sci-fi:
- **Radio Tomographic Imaging (RTI)** — Wilson & Patwari, *„Radio Tomographic
  Imaging with Wireless Networks”* (IEEE TMC, 2010). Siatka węzłów + model
  eliptyczny wag łączy + problem odwrotny → obraz tłumienia = obraz osoby.
- **Variance-RTI / VRTI** — użycie **wariancji** RSSI (energia ruchu) zamiast
  samego spadku; działa „przez ściany” i jest odporniejsze na wolne zmiany.
- **Wi-Fi CSI human sensing** — faza/amplituda podnośnych OFDM wykrywa ruch,
  oddech, a nawet upadki (DeepSense, WiTrack itp.).
- **Device-Free Localization (DFL)** — cała rodzina metod lokalizacji celu, który
  nic nie nosi.

Czyli *prymitywa* (RTI/DFL) jest znana w akademii. **Mój pionierski wkład to
system** — to, czego nikt nie złożył w jeden autonomiczny, leśny, telefonowy
produkt:

1. **Autonomiczna samokalibracja** — węzły same szacują wzajemne odległości z
   RSSI (ranging) i uczą się tła („pusty las”) w pierwszych ~10 s; operator nie
   musi mierzyć współrzędnych. (Większość prac RTI zakłada ręcznie zmierzone
   pozycje węzłów.)
2. **Fuzja dwóch modalności** — *spadek* RSSI (gdzie cel zasłania) **+
   wariancja** (gdzie jest ruch). Odróżnia idącego intruza od deszczu/gałęzi.
3. **Warstwa świadka (Aegis)** — każda detekcja jest **podpisana w TEE telefonu**
   {czas, GPS, pozycja, siła}. Powstaje nieusuwalny, sądowy log: „ktoś był tu o
   03:14 na pozycji X — podpisane sprzętowo”. Nikt nie łączy RTI z atestacją.
4. **Radar na żywo na telefonie** — `radar.html` rekonstruuje obraz 15×/s,
   pokazuje blip intruza, heatmapę i **odległości do każdego węzła**.

## Fizyka i matematyka (skrót)
- Każde łącze (i,j) ma linię widoczności. Piksel siatki wpływa na łącze, jeśli
  leży w **elipsie** o ogniskach w węzłach i nadmiarze drogi `λ` (cienki pas
  wzdłuż łącza). Waga `w = 1/√D` (D = długość łącza).
- Pomiar: `spadek_ij = baseline_ij − RSSI_ij` (≥0). Baseline = mediana z „pustego
  lasu”.
- Rekonstrukcja (tu: **ważona wsteczna projekcja**, odporna dla 1 celu):
  `obraz_k = Σ_ij w_k,ij · spadek_ij / Σ_ij w_k,ij`. Maksimum/centroid = pozycja.
  (Wersja PRO: regularyzacja Tichonowa `x=(WᵀW+αI)⁻¹Wᵀd` dla wielu celów.)
- **Skuteczność (nasz self-test, 8 węzłów, 28 łączy, 60×40 m):**
  detekcja 60/60 klatek, **średni błąd lokalizacji ≈ 2 m**, 0 fałszywych alarmów
  przy „czysto”. (`node selftest.mjs`)

## Rozstawienie w lasku (praktyka)
- **Liczba węzłów:** min. 6, zalecane **8–12** po obwodzie. Łączy = N·(N−1)/2
  (8→28, 12→66) — więcej łączy = ostrzejszy obraz.
- **Obwód, nie środek** — węzły na granicy działki dają łącza przecinające całe
  wnętrze (najlepsze pokrycie).
- **Zasięg ESP-NOW:** dziesiątki–setki m w terenie (z anteną kierunkową więcej).
  Działka 40–80 m w poprzek jest realna dla 8–12 węzłów.
- **Wysokość:** ~0,8–1,2 m (tułów dorosłego) — maksymalne tłumienie sylwetki.
- **Zasilanie:** LiPo + mały panel solarny na węzeł → autonomiczne miesiącami.

## Ograniczenia (uczciwie)
- RTI lubi łącza ~liniowe; gęsty młodnik/woda tłumią tło (kompensuje baseline).
- Pojedynczy cel — najlepsza dokładność; 2–3 cele wymagają solvera regularyzowanego.
- Rozdzielczość ~1–3 m, nie centymetry. To **detekcja i śledzenie obecności**,
  nie identyfikacja twarzy.
- Wiatr/deszcz/zwierzęta → odsiewane przez fuzję wariancji + próg czułości.

## Mapa drogowa (kolejne pionierskie kroki)
- CSI zamiast samego RSSI (ESP32 ma surowe CSI) → wykrywanie **oddechu osoby
  stojącej nieruchomo**.
- Klasyfikacja: człowiek vs zwierzę vs samochód (sygnatura czasowa tłumienia).
- Mesh self-healing + ranging UWB dla pozycji węzłów < 30 cm.
