# Beş Poisson modelinin ileriye dönük kabulü

Bu araç güvenli geliştirme dalında, çevrimdışı modelleri ve ESPN ile Football-Data’nın açık okuma uçlarını kullanır. Uygulamayla bir çalışma zamanı bağlantısı yoktur. Canlı varsayılan Worker v1.2’dir. Araç varsayılan olarak kapalıdır. `--mode disabled` ağı ve kayıt dizinini kullanmaz. Araştırmayı durdurmak için bu modu kullanın. Son başarılı kayıtları sonuçlandırmak için `--mode settle` yeni tahmin kaydetmeden çalışır.

## Çalıştırma

Ön yüz güvenli dalını ve Worker `11b33639352b58be6892ed04d87e4a9eea9bdc2e` revizyonunu ayrı, temiz dizinlerde tutun. Football-Data CSV istekleri için HTTPS erişimli curl gerekir. Arşiv dizinini her çalıştırmada aynı kullanın. Çıktıyı arşiv dizininin dışında, yeni bir dosya adıyla kaydedin.

```sh
node scripts/poisson-shadow.cjs --mode cycle --days 7 \
  --archive /path/to/isolated-archive --worker-checkout /path/to/worker \
  --bundle > poisson-acceptance.json

node scripts/poisson-shadow.cjs --mode settle \
  --archive /path/to/isolated-archive --worker-checkout /path/to/worker \
  --restore poisson-acceptance.json --bundle > poisson-settlement.json
```

`cycle` önce gerçek, henüz başlamamış fikstürleri yakalar, ardından kesinleşmiş sonuçları denetler. `--restore` önceki paketin kayıtlarını özgün zaman damgaları ve SHA-256 özetleriyle geri yükler. Çakışan kayıt korunur ve hata bildirilir. Aynı arşiv yolunda yeniden çalıştırma fikstürün ilk kaydını korur. Tahmin ve sonuç dosyaları değiştirilemez şekilde oluşturulur. Yerel SHA-256 kazara değişikliği yakalar. Dosyaları yazabilen bir yetkiliye karşı bağımsız zaman damgası veya imza yerine geçmez. Tam paket ve dışarıda saklanan özet, ileriye dönük denetimin kanıtıdır.

## Kabul kuralları

- Lig ve takım kimlikleri ESPN skor tablosundan alınır. Bilinen açık ad eşlemeleri dışında takım adına yaklaşık eşleştirme uygulanmaz. İki sezonluk Football-Data arşivinde İstanbul takvimine göre yakalama gününden önceki kesin sonuçlar kullanılır. Eğitim sınırı 1 Temmuz’dur. v1.4’ün rho değeri sınırın öncesindeki, gün gün ayrılmış veride öğrenilir.
- Beş modelin hepsi için maç sonu çıktısı olan bir fikstür, ortak anlık görüntü SHA-256 özetiyle birlikte tek seferde kaydedilir. İlk yarı verisi eksikse ilgili modelin ilk yarı alanı boş kalır. Olasılık güveni, en yüksek 1-X-2 değeri ve kullanılan sayı örneklem bilgisi olarak saklanır. Sıcaklık kalibrasyonu uygulanmaz.
- Eski ön yüzün 0–10 gol ızgarası matematiksel davranışıyla birlikte saklanır. Diğer dört model 1-X-2 toplamı toleransından geçer. Maç sonu ve ilk yarı olasılıkları, gerçek oranlardan bağımsız model çıktılarıdır.
- Başlama saati, ESPN kimliği ve iki takımın kimlikleri eşleşir. Ertelenen, iptal edilen, hükmen sonuçlanan ve saati değişen fikstürler ayrı durum olarak raporlanır. İlk yarı, ayrı ESPN maç özetindeki iki normal süre bölümünün toplamı skor tablosundaki kesin skorla eşleştiğinde kabul edilir. Birbirini tutmayan açık final skorları karşılaştırmaya alınmaz.
- Geçmiş 24 v1.2 tahmini ayrı doğrulanır. Beşli ileriye dönük ölçüm, yalnızca yeni ve zamanında mühürlenmiş kayıtlardan hesaplanır. Sonuçlar 2024/25 ve 2025/26 geçmiş kabul raporuna eklenmez.
- Sonuçlanan az sayıda maç için ölçümler betimleyicidir. Bu pilotta 100 ortak sonuç ve sekiz 28 günlük zaman bloğu oluştuğunda eşleştirilmiş güven aralıkları hesaplanır. Altı lig ve farklı model revizyonları için ayrı sayaç tutulur. Birden çok model revizyonu varsa ortak kalibrasyon veya üstünlük ölçümü üretilmez. Bunlar araştırma ölçütleridir, otomatik üretim modeli seçimi yapılmaz.
