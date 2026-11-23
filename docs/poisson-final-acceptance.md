# Poisson son geliştirme ve gerçek veri kabulü

**Worker v1.3 araştırma adayıdır.** İki ayrı sezonda varsayılan v1.2’ye karşı hem log loss hem Brier iyileşti. Mevcut ürün arşivinde yalnızca v1.2’nin zaman damgalı tahminleri bulunduğundan canlı geçiş için beş modelin ileriye dönük ortak testi eksik.

## Veri ve yöntem

- Football-Data 2023/24, 2024/25 ve 2025/26 sezonları. 18 dosyadaki 6.284 satırdan 6.278 kayıt temiz. Tam süre ve ilk yarı koşularının her birinde aynı 4.930 fikstür var. Kaynak SHA-256 değerleri ve tam süre ölçümleri önceki raporla aynı. [CSV indirme adresleri ve altı dışlama](poisson-integration-readiness.md#kaynaklar-ve-maç-kapsamı)
- Maç günü bitmeden o günün sonuçları hiçbir modele verilmedi. v1.4 rho parametresi 1 Ocak 2024 öncesi verilerle eğitilip donduruldu. İlk yarı koşusunda her model ilk yarı skoru geçmişiyle yeniden çalıştırıldı. Ön yüzün ilk yarı koşusu aynı Poisson formülünün ilk yarı skor arşivinde uygulanmasıdır. Canlı arayüzdeki ayrı yarı gol ekranı bu ölçüme dahil değil.
- 1-X-2 sıcaklık parametreleri 2024’ün ilk yarısındaki 1109 maçta öğrenildi. Lig başına genel sıcaklık, lig sıcaklığı veya özgün olasılıklar arasında seçim 2024/25’teki 1927 maçta yapıldı. Seçim için log loss düşüşü ve Brier’da kötüleşmeme koşulu uygulandı. Dondurulmuş seçimler 2025/26’daki 1894 maçta sınandı. 2,5 üst/alt, KG ve skor tahminleri sıcaklık ölçeklemesinden bağımsız kaldı.
- Aynı fikstürün model tahminleri eşleşti. Aralıklar sezon bazında örneklenen, tüm ligleri aynı tarihlerde bir arada tutan 28 günlük bloklarla 6.000 yüzdelik bootstrap tekrarından hesaplandı. Adayların v1.2 ile önceden belirlenen iki karşılaştırmasında %97,5 aile düzeltmeli aralıklar kullanıldı. Tek sezonlu karşılaştırmalarda 11 blok bulunuyor. Lig ayrımları ve diğer çiftler için %95 aralıklar keşif amaçlıdır.

## Maç sonu sonuçları

| Kapsam | Model | Maç | 1-X-2 | Log loss | Brier | ECE | 2,5 üst/alt | KG | İlk 5 skor |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Genel | Mevcut ön yüz | 4930 | %48,95 | 1,033809 | 0,620293 | %2,10 | %53,37 | %52,92 | %45,33 |
| Genel | Normalize ön yüz | 4930 | %48,95 | 1,033797 | 0,620294 | %2,10 | %53,37 | %52,92 | %45,35 |
| Genel | Worker v1.2 | 4930 | %49,72 | 1,053244 | 0,620213 | %6,79 | %54,65 | %52,27 | %45,50 |
| Genel | Worker v1.3 | 4930 | %50,24 | 1,019242 | 0,609471 | %2,97 | %54,48 | %53,47 | %46,65 |
| Genel | Worker v1.4 | 4930 | %50,97 | 1,018006 | 0,609469 | %2,47 | %54,52 | %53,71 | %47,06 |
| Süper Lig | Mevcut ön yüz | 798 | %52,76 | 1,013226 | 0,604429 | %2,57 | %49,25 | %50,75 | %44,99 |
| Süper Lig | Normalize ön yüz | 798 | %52,76 | 1,013215 | 0,604429 | %2,57 | %49,25 | %50,75 | %44,99 |
| Süper Lig | Worker v1.2 | 798 | %51,38 | 1,016245 | 0,603198 | %6,58 | %53,38 | %50,88 | %44,11 |
| Süper Lig | Worker v1.3 | 798 | %52,51 | 0,998956 | 0,594959 | %4,32 | %52,26 | %51,50 | %45,99 |
| Süper Lig | Worker v1.4 | 798 | %53,51 | 0,997712 | 0,594376 | %4,21 | %52,26 | %52,51 | %45,86 |
| Premier League | Mevcut ön yüz | 889 | %47,24 | 1,045197 | 0,627136 | %3,36 | %52,42 | %56,24 | %42,86 |
| Premier League | Normalize ön yüz | 889 | %47,24 | 1,045180 | 0,627137 | %3,36 | %52,42 | %56,24 | %42,86 |
| Premier League | Worker v1.2 | 889 | %49,94 | 1,037250 | 0,617572 | %6,23 | %51,97 | %53,54 | %43,64 |
| Premier League | Worker v1.3 | 889 | %50,51 | 1,021625 | 0,610310 | %3,16 | %53,88 | %55,01 | %45,67 |
| Premier League | Worker v1.4 | 889 | %51,07 | 1,022747 | 0,611819 | %2,26 | %55,12 | %55,12 | %45,11 |
| Bundesliga | Mevcut ön yüz | 734 | %48,50 | 1,049324 | 0,631654 | %6,38 | %59,95 | %58,86 | %38,01 |
| Bundesliga | Normalize ön yüz | 734 | %48,50 | 1,049298 | 0,631658 | %6,39 | %59,95 | %58,86 | %38,01 |
| Bundesliga | Worker v1.2 | 734 | %49,32 | 1,112880 | 0,637401 | %9,93 | %59,26 | %51,91 | %38,42 |
| Bundesliga | Worker v1.3 | 734 | %49,18 | 1,041710 | 0,623554 | %6,01 | %60,22 | %56,68 | %38,56 |
| Bundesliga | Worker v1.4 | 734 | %50,82 | 1,031896 | 0,618706 | %3,80 | %61,04 | %59,95 | %41,14 |
| La Liga | Mevcut ön yüz | 903 | %49,06 | 1,019769 | 0,613030 | %2,59 | %54,71 | %49,50 | %50,94 |
| La Liga | Normalize ön yüz | 903 | %49,06 | 1,019761 | 0,613030 | %2,59 | %54,71 | %49,50 | %50,94 |
| La Liga | Worker v1.2 | 903 | %49,06 | 1,032698 | 0,616130 | %6,27 | %56,15 | %54,49 | %51,16 |
| La Liga | Worker v1.3 | 903 | %49,83 | 1,009882 | 0,603267 | %2,39 | %55,37 | %55,15 | %52,16 |
| La Liga | Worker v1.4 | 903 | %50,50 | 1,010996 | 0,605208 | %3,07 | %56,81 | %54,15 | %52,93 |
| Serie A | Mevcut ön yüz | 898 | %47,88 | 1,043089 | 0,626444 | %1,55 | %52,90 | %51,34 | %51,45 |
| Serie A | Normalize ön yüz | 898 | %47,88 | 1,043085 | 0,626444 | %1,55 | %52,90 | %51,34 | %51,45 |
| Serie A | Worker v1.2 | 898 | %49,00 | 1,080152 | 0,625385 | %6,41 | %55,12 | %52,67 | %52,12 |
| Serie A | Worker v1.3 | 898 | %49,55 | 1,024419 | 0,614706 | %2,93 | %54,57 | %51,78 | %53,34 |
| Serie A | Worker v1.4 | 898 | %50,56 | 1,025919 | 0,616058 | %3,22 | %52,78 | %50,11 | %52,45 |
| Ligue 1 | Mevcut ön yüz | 708 | %48,45 | 1,032762 | 0,619268 | %2,69 | %51,27 | %51,41 | %41,53 |
| Ligue 1 | Normalize ön yüz | 708 | %48,45 | 1,032750 | 0,619268 | %2,69 | %51,27 | %51,41 | %41,67 |
| Ligue 1 | Worker v1.2 | 708 | %49,72 | 1,045277 | 0,623534 | %7,18 | %52,12 | %49,29 | %41,10 |
| Ligue 1 | Worker v1.3 | 708 | %49,86 | 1,021191 | 0,611449 | %6,20 | %50,56 | %50,42 | %41,53 |
| Ligue 1 | Worker v1.4 | 708 | %49,29 | 1,019430 | 0,611029 | %3,33 | %48,87 | %50,85 | %42,66 |

## Daha sonraki iki sezonda v1.2’ye karşı fark

Negatif fark log loss ve Brier için iyileşme. Aralıklar %97,5.

| Aday | Dönem | Kalibrasyon durumu | Δ log loss [GA] | Δ Brier [GA] |
|---|---|---|---:|---:|
| Worker v1.3 | 2024/25 | Özgün | -0,036313 [-0,080546, -0,012746] | -0,009372 [-0,012295, -0,006200] |
| Worker v1.3 | 2025/26 | Özgün | -0,044203 [-0,095120, -0,020961] | -0,013926 [-0,016968, -0,010350] |
| Worker v1.4 | 2024/25 | Özgün | -0,034450 [-0,078991, -0,003181] | -0,007118 [-0,015041, 0,000951] |
| Worker v1.4 | 2025/26 | Özgün | -0,052158 [-0,110233, -0,019767] | -0,017730 [-0,025634, -0,007384] |
| Worker v1.3 | 2024/25 | İki model de kalibre | -0,014975 [-0,043016, -0,000866] | -0,002822 [-0,005193, -0,000221] |
| Worker v1.3 | 2025/26 | İki model de kalibre | -0,017358 [-0,053371, -0,001456] | -0,004047 [-0,007169, -0,001449] |
| Worker v1.4 | 2024/25 | İki model de kalibre | -0,011788 [-0,040596, 0,008060] | -0,000312 [-0,005284, 0,006394] |
| Worker v1.4 | 2025/26 | İki model de kalibre | -0,021914 [-0,065572, 0,002249] | -0,006355 [-0,015103, 0,002346] |

## Kalibrasyon sonuçları

Önceki normalize ön yüz ölçümünde %50–60 güven dilimindeki 1310 maçta ortalama olasılık %54,65 ve isabet %50,38. Aşağıdaki sonuçlar ayrılmış 2025/26 son testinden. Sıcaklık dilim üyeliğini değiştirdiğinden önce ve sonra aynı aralıktaki maç sayıları farklı olabilir.

| Model | Dönem | Log loss önce → sonra | Brier önce → sonra | ECE önce → sonra |
|---|---|---:|---:|---:|
| Mevcut ön yüz | 2024/25 | 1,025624 → 1,022609 | 0,614728 → 0,612620 | %2,26 → %0,50 |
| Mevcut ön yüz | 2025/26 | 1,044966 → 1,043787 | 0,626971 → 0,626656 | %2,48 → %1,61 |
| Normalize ön yüz | 2024/25 | 1,025609 → 1,022606 | 0,614728 → 0,612620 | %2,26 → %0,50 |
| Normalize ön yüz | 2025/26 | 1,044956 → 1,043786 | 0,626973 → 0,626656 | %2,48 → %1,66 |
| Worker v1.2 | 2024/25 | 1,043618 → 1,018961 | 0,610071 → 0,601728 | %6,11 → %1,10 |
| Worker v1.2 | 2025/26 | 1,083047 → 1,053285 | 0,635790 → 0,624668 | %7,62 → %2,23 |
| Worker v1.3 | 2024/25 | 1,007305 → 1,003985 | 0,600699 → 0,598905 | %2,12 → %1,61 |
| Worker v1.3 | 2025/26 | 1,038844 → 1,035926 | 0,621863 → 0,620621 | %3,67 → %2,27 |
| Worker v1.4 | 2024/25 | 1,009169 → 1,007172 | 0,602953 → 0,601416 | %3,23 → %2,37 |
| Worker v1.4 | 2025/26 | 1,030889 → 1,031371 | 0,618060 → 0,618313 | %1,95 → %1,55 |

Normalize ön yüzde son test log loss ve Brier farklarının %95 aralığı sıfırı kapsıyor. v1.4 sıcaklık ayarı son testte iki metriği de kötüleştirdi ve araştırma kabulünü geçmedi.

| Normalize ön yüz, 2025/26 | 1 ECE önce → sonra | X ECE önce → sonra | 2 ECE önce → sonra |
|---|---:|---:|---:|
| Genel | %3,47 → %2,99 | %1,99 → %1,17 | %3,08 → %2,25 |
| Süper Lig | %4,44 → %4,61 | %6,76 → %6,54 | %7,73 → %8,23 |
| Premier League | %5,70 → %3,81 | %3,28 → %2,13 | %3,46 → %3,03 |
| Bundesliga | %5,52 → %5,31 | %3,89 → %2,99 | %6,93 → %6,52 |
| La Liga | %6,61 → %6,10 | %1,88 → %2,05 | %4,27 → %4,10 |
| Serie A | %3,17 → %4,30 | %3,17 → %2,66 | %1,93 → %2,93 |
| Ligue 1 | %5,03 → %5,03 | %2,82 → %2,82 | %6,54 → %6,54 |

| Normalize ön yüz %50–60 güven dilimi, 2025/26 | Maç | Ortalama olasılık | Gerçekleşen |
|---|---:|---:|---:|
| Önce | 506 | %54,63 | %48,62 |
| Sonra | 485 | %54,40 | %52,16 |

## İlk yarı ve ürün arşivi

| İlk yarı modeli | Maç | 1-X-2 | Log loss | Brier | İlk 5 skor |
|---|---:|---:|---:|---:|---:|
| Mevcut ön yüz | 4930 | %39,41 | 1,103671 | 0,665937 | %82,47 |
| Normalize ön yüz | 4930 | %39,41 | 1,103671 | 0,665937 | %82,47 |
| Worker v1.2 | 4930 | %40,77 | 1,315452 | 0,683498 | %79,59 |
| Worker v1.3 | 4930 | %41,42 | 1,096691 | 0,661703 | %82,07 |
| Worker v1.4 | 4930 | %41,42 | 1,076852 | 0,652095 | %83,14 |

- Arşivde 22 Kasım 2026’da maç başlamadan kayıt altına alınan 24 gerçek v1.2 tahmini var. 23 Kasım 08.30 TSİ itibarıyla 18 karşılaşma, ESPN kimliği, lig, başlama saati, takımlar, kesinleşmiş skor ve satır özeti ile doğrulandı. Altı fikstürün başlama zamanı henüz gelmemişti. 18 maçta 1-X-2 %50,00, log loss 0,974580, Brier 0,578503. Arşiv üç skor tahmini ve yalnızca bir model içeriyor. [Ürünün zaman damgalı tahmin dosyası](https://github.com/mahmetisildak34/mac-analiz-worker/blob/11b33639352b58be6892ed04d87e4a9eea9bdc2e/research/real-pre-match-forecast-evidence-2026-11-22.json)
- Kayıtların skor eşleşmesi ESPN’in açık sonuç istekleriyle yapıldı. [Süper Lig sonuç isteği](https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=20261122&limit=500)

## Yeniden çalıştırma

```sh
node scripts/backtest-poisson.cjs --test-start 2024-01-01 \
  --worker-checkout /path/to/mac-analiz-worker \
  --calibration-validation-start 2024-07-01 \
  --calibration-test-start 2025-07-01 /path/to/football-data/*.csv
node scripts/backtest-poisson.cjs --period half --test-start 2024-01-01 \
  --worker-checkout /path/to/mac-analiz-worker /path/to/football-data/*.csv
node scripts/poisson-prospective.cjs /path/to/forecasts.json /path/to/espn-boards 2026-11-23T05:30:00Z
```

Worker revizyonu `11b33639352b58be6892ed04d87e4a9eea9bdc2e`. Ayrıntılı JSON her lig ve sezonun yedi metriğini, 1-X-2 sınıf dilimlerini, tüm ikili model farklarını, kalibrasyon seçimlerini, kaynak özetlerini ve ürün arşivi eşleşmelerini içeriyor.
