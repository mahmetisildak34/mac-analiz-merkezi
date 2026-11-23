# Poisson entegrasyon ve geriye dönük kabul raporu

18 Football-Data CSV dosyasında 6,284 sonuç işlendi. 6,278 sonuç veri kalite kontrolünden geçti. Beş model, 4,930 ortak maçta değerlendirildi. Normalize ön yüzün ortalama 1-X-2 olasılık toplamı 1.000000000 ve mevcut ön yüzün 0.999986943. Ortak eşitlik kuralıyla 1-X-2 doğruluğu 48.95% ve 48.95%. Log loss farkı -0.00001264 ve Brier farkı +0.00000071. Bu ölçekte yeni hesap için tahmin başarısı üstünlüğü gösterilemedi. Varsayılan ön yüz motoru değişmedi.

## Kaynaklar ve maç kapsamı

Kaynak [Football-Data sezon arşivi](https://www.football-data.co.uk/data.php). Her hücre bağlantısı indirilen CSV’ye gider. Hücrelerdeki sayılar temiz/girdi şeklindedir.

| Lig | 2023/24 | 2024/25 | 2025/26 | Temiz toplam | Ortak test |
|---|---:|---:|---:|---:|---:|
| Süper Lig | [379/380](https://www.football-data.co.uk/mmz4281/2324/T1.csv) | [341/342](https://www.football-data.co.uk/mmz4281/2425/T1.csv) | [306/306](https://www.football-data.co.uk/mmz4281/2526/T1.csv) | 1026 | 798 |
| Premier League | [380/380](https://www.football-data.co.uk/mmz4281/2324/E0.csv) | [380/380](https://www.football-data.co.uk/mmz4281/2425/E0.csv) | [380/380](https://www.football-data.co.uk/mmz4281/2526/E0.csv) | 1140 | 889 |
| Bundesliga | [306/306](https://www.football-data.co.uk/mmz4281/2324/D1.csv) | [305/306](https://www.football-data.co.uk/mmz4281/2425/D1.csv) | [306/306](https://www.football-data.co.uk/mmz4281/2526/D1.csv) | 917 | 734 |
| La Liga | [380/380](https://www.football-data.co.uk/mmz4281/2324/SP1.csv) | [380/380](https://www.football-data.co.uk/mmz4281/2425/SP1.csv) | [380/380](https://www.football-data.co.uk/mmz4281/2526/SP1.csv) | 1140 | 903 |
| Serie A | [379/380](https://www.football-data.co.uk/mmz4281/2324/I1.csv) | [379/380](https://www.football-data.co.uk/mmz4281/2425/I1.csv) | [380/380](https://www.football-data.co.uk/mmz4281/2526/I1.csv) | 1138 | 898 |
| Ligue 1 | [306/306](https://www.football-data.co.uk/mmz4281/2324/F1.csv) | [305/306](https://www.football-data.co.uk/mmz4281/2425/F1.csv) | [306/306](https://www.football-data.co.uk/mmz4281/2526/F1.csv) | 917 | 708 |

Altı istisna eğitimden ve testten çıkarıldı. [İstanbulspor–Trabzonspor](https://www.tff.org/default.aspx?ftxtID=43023&pageID=246) ve [Galatasaray–Adana Demirspor](https://www.tff.org/default.aspx?ftxtID=46746&pageID=246) hükmen sonuçlandı. [Union Berlin–Bochum](https://www.bundesliga.com/en/bundesliga/news/dfb-rules-in-favour-of-bochum-win-union-berlin-lighter-hit-player-appeal-30346) skoru daha sonra değiştirildi. [Montpellier–Saint-Étienne](https://www.lfp.fr/article/commission-de-discipline-les-decisions-du-2-avril-2025) yarıda kaldı. [Udinese–Roma](https://www.udinese.it/news/squad/date-confirmed-for-resumption-of-udinese-v-roma) ve [Fiorentina–Inter](https://img.legaseriea.it/vimages/679d1d0c/155%20-%20Serie%20A%20Enilive%20Recupero%20Bologna-Milan%20%289%5Eg%29%20e%20Prosecuzione%20Fiorentina-Inter%20%2814%5Eg%29.pdf) farklı tarihlerde devam ettirildi. Arşivde yalnızca devam tarihi bulunduğundan ilk başlama anına göre tahmin üretilmedi.

## Yöntem

- 1 Ocak 2024 öncesindeki 1,021 maç eğitim ve başlangıç geçmişi olarak kullanıldı. Bu tarihten itibaren 5,257 temiz sonuç vardı. On maçlık ön yüz eşiğini 4,937 sonuç karşıladı. Worker uygunluğu da uygulandığında ortak kümede 4,930 sonuç kaldı. Üç sezonun son test günü 2026-05-24.
- Sonuçlar her yerel takvim günü tamamlandıktan sonra geçmişe eklendi. Takip eden günlerde geçmiş genişledi. Lig, sezon ve sıralı ev sahibi/deplasman ikilisiyle mükerrer kayıtlar kontrol edildi. Bir üst lig sezonu atlayan kulüp dönüşte yeni örneklemle başladı. Football-Data takma adları lig içinde aynen kullanıldı. Piyasa oranları, şut verileri ve hedef maçın skoru tahmin girdisi değildi.
- Ön yüzün iki sürümüne aynı lambda verildi. Ön yüzün on maç sınırı, üç maçlık saha örneklemi eşiği, genel örnekleme geçişi ve 0,15–4 lambda aralığı tekrarlandı. Ürün arşivindeki başka organizasyonların maçları bu lig arşiviyle yeniden oluşturulamadığı için karşılaştırma yalnızca aynı lig geçmişini kullanır.
- Worker kodu [`ee555aa`](https://github.com/mahmetisildak34/mac-analiz-worker/commit/ee555aacb45f0ba80dda4c541c6cac352fcf0534) revizyonundan çevrimdışı çalıştırıldı. v1.2 ve v1.3 için toplam olasılık kütlesini korumak üzere araştırma karşılaştırmasındaki 20 gol sınırı kullanıldı. v1.4 sabit 10 maç ve 90 gün yarı ömür ayarlarıyla çalıştı. Lig başına rho, yalnızca 1 Ocak 2024 öncesindeki ileri yürüyen tahminlerde uyduruldu ve test boyunca donduruldu. Bunlar geçmişi yeniden oynatan tahminlerdir. Maçtan önce kaydedilmiş ürün tahminleri bu çalışmada ölçülmedi.
- Brier, üç sınıfın karesel hatalarının toplamıdır. Log loss doğal logaritma kullanır. 1-X-2 seçiminde en büyük olasılıkla farkı en fazla 1e-12 olan ilk seçenek seçildi. Kesin kayan nokta sırasıyla ölçülen doğruluk ayrıca saklandı. İkili pazarlarda seçim eşiği 0,5. Kalibrasyon ECE’si en yüksek olasılığın on sabit dilimi üzerinden hesaplandı. Wilson %95 aralıkları maç bağımlılığını modellemeyen betimleyici aralıklardır.

## Beş modelin ortak test sonuçları

| Model | Maç | 1-X-2 | Log loss | Brier | ECE | İlk skor | İlk 5 skor |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mevcut ön yüz | 4930 | 48.95% | 1.033809 | 0.620293 | 2.10% | 10.71% | 45.33% |
| Normalize ön yüz | 4930 | 48.95% | 1.033797 | 0.620294 | 2.10% | 10.71% | 45.35% |
| Worker v1.2 | 4930 | 49.72% | 1.053244 | 0.620213 | 6.79% | 10.63% | 45.50% |
| Worker v1.3 | 4930 | 50.24% | 1.019242 | 0.609471 | 2.97% | 11.66% | 46.65% |
| Worker v1.4 | 4930 | 50.97% | 1.018006 | 0.609469 | 2.47% | 11.72% | 47.06% |

Kesin kayan nokta karşılaştırmasıyla 1-X-2 doğruluğu mevcut ön yüzde 48.95% ve normalize ön yüzde 48.84%. Yalnız iki ön yüz modelini eşleştiren 4,937 maçlık ek koşu da aynı entegrasyon sonucunu verdi.

| Model | 2.5 üst/alt doğruluk | Log loss | Brier | KG var/yok doğruluk | Log loss | Brier |
|---|---:|---:|---:|---:|---:|---:|
| Mevcut ön yüz | 53.37% | 0.709798 | 0.257030 | 52.92% | 0.706412 | 0.255829 |
| Normalize ön yüz | 53.37% | 0.709798 | 0.257030 | 52.92% | 0.706412 | 0.255829 |
| Worker v1.2 | 54.65% | 0.740021 | 0.267001 | 52.27% | 0.741343 | 0.267384 |
| Worker v1.3 | 54.48% | 0.710310 | 0.256541 | 53.47% | 0.706296 | 0.255736 |
| Worker v1.4 | 54.52% | 0.694134 | 0.250090 | 53.71% | 0.693920 | 0.250173 |

## Normalize ön yüz için güven dilimleri

| 1-X-2 seçim güveni | Maç | Ortalama tahmin | Gerçekleşen | Wilson %95 |
|---|---:|---:|---:|---:|
| %30–40 | 703 | 38.02% | 39.26% | 35.72%–42.92% |
| %40–50 | 1980 | 44.84% | 44.60% | 42.42%–46.79% |
| %50–60 | 1310 | 54.65% | 50.38% | 47.68%–53.08% |
| %60–70 | 699 | 64.23% | 61.66% | 58.00%–65.19% |
| %70–80 | 201 | 73.95% | 67.16% | 60.40%–73.28% |
| %80–90 | 37 | 82.69% | 75.68% | 59.88%–86.64% |

## Lig ve sezon sonuçları

Her model hücresi 1-X-2 doğruluğu / log loss / Brier / ECE sırasındadır. JSON çıktısı her lig, sezon ve model için ikili pazar metriklerini, skor isabetlerini ve sınıf bazlı kalibrasyon dilimlerini de içerir.

| Lig | Sezon | Ortak maç | Mevcut ön yüz | Normalize ön yüz | Worker v1.2 | Worker v1.3 | Worker v1.4 |
|---|---|---:|---:|---:|---:|---:|---:|
| Süper Lig | Toplam | 798 | 52.76% / 1.0132 / 0.6044 / 2.57% | 52.76% / 1.0132 / 0.6044 / 2.57% | 51.38% / 1.0162 / 0.6032 / 6.58% | 52.51% / 0.9990 / 0.5950 / 4.32% | 53.51% / 0.9977 / 0.5944 / 4.21% |
| Süper Lig | 2023/24 | 210 | 55.24% / 1.0049 / 0.6003 / 7.41% | 55.24% / 1.0049 / 0.6003 / 7.41% | 54.76% / 0.9797 / 0.5845 / 5.52% | 53.81% / 0.9745 / 0.5815 / 5.85% | 55.24% / 0.9842 / 0.5873 / 6.32% |
| Süper Lig | 2024/25 | 313 | 55.91% / 0.9806 / 0.5808 / 5.38% | 55.91% / 0.9806 / 0.5808 / 5.38% | 56.23% / 0.9664 / 0.5654 / 7.13% | 56.55% / 0.9557 / 0.5624 / 4.72% | 56.55% / 0.9647 / 0.5694 / 6.45% |
| Süper Lig | 2025/26 | 275 | 47.27% / 1.0567 / 0.6345 / 5.41% | 47.27% / 1.0567 / 0.6345 / 5.41% | 43.27% / 1.1009 / 0.6605 / 10.85% | 46.91% / 1.0669 / 0.6424 / 9.05% | 48.73% / 1.0456 / 0.6283 / 3.23% |
| Premier League | Toplam | 889 | 47.24% / 1.0452 / 0.6271 / 3.36% | 47.24% / 1.0452 / 0.6271 / 3.36% | 49.94% / 1.0373 / 0.6176 / 6.23% | 50.51% / 1.0216 / 0.6103 / 3.16% | 51.07% / 1.0227 / 0.6118 / 2.26% |
| Premier League | 2023/24 | 184 | 51.09% / 1.0050 / 0.5972 / 6.26% | 51.09% / 1.0049 / 0.5972 / 6.26% | 54.89% / 0.9575 / 0.5639 / 9.12% | 55.43% / 0.9596 / 0.5649 / 4.10% | 56.52% / 0.9770 / 0.5765 / 5.09% |
| Premier League | 2024/25 | 353 | 46.46% / 1.0349 / 0.6206 / 4.78% | 46.46% / 1.0349 / 0.6206 / 4.78% | 51.56% / 1.0302 / 0.6084 / 7.90% | 52.12% / 1.0105 / 0.6017 / 7.29% | 52.69% / 1.0118 / 0.6045 / 4.17% |
| Premier League | 2025/26 | 352 | 46.02% / 1.0765 / 0.6494 / 5.12% | 46.02% / 1.0765 / 0.6494 / 5.12% | 45.74% / 1.0860 / 0.6549 / 7.70% | 46.31% / 1.0652 / 0.6427 / 5.02% | 46.59% / 1.0577 / 0.6376 / 4.41% |
| Bundesliga | Toplam | 734 | 48.50% / 1.0493 / 0.6317 / 6.38% | 48.50% / 1.0493 / 0.6317 / 6.39% | 49.32% / 1.1129 / 0.6374 / 9.93% | 49.18% / 1.0417 / 0.6236 / 6.01% | 50.82% / 1.0319 / 0.6187 / 3.80% |
| Bundesliga | 2023/24 | 163 | 48.47% / 1.0508 / 0.6350 / 8.42% | 48.47% / 1.0508 / 0.6350 / 8.42% | 50.31% / 1.0190 / 0.6130 / 11.67% | 50.31% / 1.0056 / 0.6035 / 7.33% | 52.76% / 1.0143 / 0.6086 / 9.20% |
| Bundesliga | 2024/25 | 285 | 44.56% / 1.0677 / 0.6465 / 7.82% | 44.56% / 1.0677 / 0.6465 / 7.83% | 47.02% / 1.2183 / 0.6636 / 12.57% | 47.02% / 1.0709 / 0.6448 / 8.62% | 47.02% / 1.0593 / 0.6387 / 5.20% |
| Bundesliga | 2025/26 | 286 | 52.45% / 1.0301 / 0.6149 / 7.58% | 52.45% / 1.0301 / 0.6149 / 7.58% | 51.05% / 1.0613 / 0.6252 / 10.06% | 50.70% / 1.0333 / 0.6138 / 9.76% | 53.50% / 1.0146 / 0.6045 / 5.48% |
| La Liga | Toplam | 903 | 49.06% / 1.0198 / 0.6130 / 2.59% | 49.06% / 1.0198 / 0.6130 / 2.59% | 49.06% / 1.0327 / 0.6161 / 6.27% | 49.83% / 1.0099 / 0.6033 / 2.39% | 50.50% / 1.0110 / 0.6052 / 3.07% |
| La Liga | 2023/24 | 200 | 50.00% / 1.0075 / 0.6045 / 7.09% | 50.00% / 1.0075 / 0.6045 / 7.09% | 51.00% / 1.0185 / 0.6114 / 4.34% | 49.00% / 1.0060 / 0.6033 / 4.00% | 52.50% / 1.0111 / 0.6063 / 8.15% |
| La Liga | 2024/25 | 351 | 47.58% / 1.0405 / 0.6266 / 4.04% | 47.58% / 1.0405 / 0.6266 / 4.04% | 48.15% / 1.0393 / 0.6184 / 7.72% | 49.29% / 1.0166 / 0.6068 / 4.42% | 49.00% / 1.0200 / 0.6112 / 4.48% |
| La Liga | 2025/26 | 352 | 50.00% / 1.0061 / 0.6043 / 3.56% | 50.00% / 1.0061 / 0.6043 / 3.56% | 48.86% / 1.0341 / 0.6165 / 8.03% | 50.85% / 1.0054 / 0.5998 / 3.71% | 50.85% / 1.0020 / 0.5986 / 5.07% |
| Serie A | Toplam | 898 | 47.88% / 1.0431 / 0.6264 / 1.55% | 47.88% / 1.0431 / 0.6264 / 1.55% | 49.00% / 1.0802 / 0.6254 / 6.41% | 49.55% / 1.0244 / 0.6147 / 2.93% | 50.56% / 1.0259 / 0.6161 / 3.22% |
| Serie A | 2023/24 | 199 | 44.72% / 1.0568 / 0.6416 / 5.38% | 44.72% / 1.0568 / 0.6416 / 5.38% | 49.25% / 1.0525 / 0.6368 / 10.05% | 47.74% / 1.0320 / 0.6249 / 6.74% | 46.73% / 1.0344 / 0.6255 / 3.81% |
| Serie A | 2024/25 | 348 | 49.14% / 1.0347 / 0.6212 / 2.74% | 49.14% / 1.0347 / 0.6212 / 2.74% | 49.71% / 1.0299 / 0.6159 / 7.02% | 49.43% / 1.0146 / 0.6079 / 2.16% | 52.59% / 1.0173 / 0.6093 / 4.83% |
| Serie A | 2025/26 | 351 | 48.43% / 1.0437 / 0.6230 / 2.02% | 48.43% / 1.0437 / 0.6230 / 2.02% | 48.15% / 1.1457 / 0.6283 / 5.83% | 50.71% / 1.0299 / 0.6157 / 3.57% | 50.71% / 1.0297 / 0.6174 / 4.76% |
| Ligue 1 | Toplam | 708 | 48.45% / 1.0328 / 0.6193 / 2.69% | 48.45% / 1.0328 / 0.6193 / 2.69% | 49.72% / 1.0453 / 0.6235 / 7.18% | 49.86% / 1.0212 / 0.6114 / 6.20% | 49.29% / 1.0194 / 0.6110 / 3.33% |
| Ligue 1 | 2023/24 | 153 | 43.79% / 1.0595 / 0.6402 / 5.98% | 43.79% / 1.0595 / 0.6402 / 5.98% | 41.83% / 1.1046 / 0.6696 / 12.92% | 45.10% / 1.0754 / 0.6530 / 13.31% | 43.79% / 1.0572 / 0.6396 / 5.03% |
| Ligue 1 | 2024/25 | 277 | 54.15% / 0.9911 / 0.5896 / 3.43% | 54.15% / 0.9911 / 0.5896 / 3.42% | 53.79% / 0.9909 / 0.5897 / 3.95% | 53.07% / 0.9753 / 0.5806 / 8.07% | 53.43% / 0.9806 / 0.5835 / 6.19% |
| Ligue 1 | 2025/26 | 278 | 45.32% / 1.0596 / 0.6373 / 6.24% | 45.32% / 1.0596 / 0.6373 / 6.24% | 50.00% / 1.0668 / 0.6319 / 8.42% | 49.28% / 1.0371 / 0.6193 / 6.73% | 48.20% / 1.0373 / 0.6228 / 5.04% |

## Tekrar çalıştırma

CSV dosyalarını `2324-T1.csv` örneğindeki gibi `SEZON-LİG.csv` olarak adlandırın. JSON çıktısı her kaynağın URL’sini ve SHA-256 özetini bildirir.

```sh
node --test tests/poisson-probabilities.test.cjs tests/backtest-poisson.test.cjs
node scripts/backtest-poisson.cjs --test-start 2024-01-01 \
  --worker-checkout /path/to/mac-analiz-worker /path/to/football-data/*.csv
```

İki ön yüz modeliyle çalıştırmak için `--worker-checkout` seçeneğini kaldırın.

## Entegrasyon kararı

- İzole motor 1-X-2, 1.5/2.5/3.5 gol üstü, karşılıklı gol ve en olası beş skoru destekliyor. Sıfır ve yüksek lambda değerleri, çok küçük gol olasılıkları, geçersiz girdiler, tarih ve veri sızıntısı regresyonları kapsamda.
- Yeni motorun canlı arayüzde etkinleştirilmesi için tahmin performansı ve gerçek ürün arşiviyle kabul kanıtı eksik. Uygulamanın maç önü, canlı maç ve yarı gol işlevleri mevcut kaynaklarıyla çalışır. Premium tema ve mobil gezinme dosyalarında değişiklik yok.
- Worker v1.4 araştırma testinde bir mevcut sözleşme uyuşmazlığı var. `exactScoreProbability` negatif veya kesirli skor için `null` döndürüyor. `research/poisson-v14-estimation.test.mjs` aynı girdilerde `RangeError` bekliyor. Backtest yalnızca doğrulanmış tam sayı skorlarla çalıştı.
