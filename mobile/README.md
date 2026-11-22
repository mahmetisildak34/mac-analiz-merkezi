# Maç Analiz Merkezi — Mobil Uygulama

Expo / React Native başlangıç uygulaması iOS ve Android için aynı ekran ve veri kurallarını kullanır.

## Geliştirme

```sh
cd mobile
npm install
npx expo start
```

## iOS ve Android paketleme kontrolü

```sh
npx expo config --type public
npx expo export --platform ios --output-dir dist/ios
npx expo export --platform android --output-dir dist/android
```

GitHub Actions, her mobil dal güncellemesinde iki platformun JavaScript bundle'ını üretip doğrular. Bu kontrol mağaza imzalı IPA/AAB üretmez ve dağıtım yapmaz.

App Store / Play Store gönderiminden önce sahibin onayladığı iOS `bundleIdentifier`, Android `package`, imza anahtarları ve mağaza hesapları tanımlanmalıdır. Bu bilgiler bilerek uydurulmamıştır.

## Veri bağlantısı ve güvenlik

- Yalnızca uygulamanın Worker API uç noktası kullanılır: `/api/fixtures?live=all&timezone=Europe/Istanbul` ve `/api/fixtures?date=YYYY-MM-DD&timezone=Europe/Istanbul`.
- Tarih filtresi İstanbul takvim gününü kullanır; Bugün ekranı yalnızca henüz başlamamış maçları, Canlı ekranı ise güvenilir canlı durumları gösterir.
- İstekler zaman aşımına ve iptal sinyaline sahiptir. Aynı anda eski sekmeden gelen yanıt yeni sekmenin verisini ezemez.
- Bozuk JSON, beklenmeyen yanıt, kota sınırı ve bağlantı hataları başarı gibi gösterilmez. Yenileme başarısız olursa aynı sekmedeki son başarılı liste korunur ve eski olduğu belirtilir.
- Testler gerçek Worker'a veya API-Football'a istek göndermez; sahte yanıtlarla çalışır.

## PWA / iOS ana ekrana ekleme

Web sürümü `manifest.webmanifest` ve `service-worker.js` ile kurulum ve çevrimdışı uygulama kabuğu desteği sağlar. Service worker yalnızca aynı origin'deki statik uygulama kabuğunu önbelleğe alır; API ve maç yanıtlarını önbelleğe almaz. iOS Safari'de Paylaş > Ana Ekrana Ekle kullanılabilir.

## Expo Snack

Snack > Project > Import git repository:
https://github.com/mahmetisildak34/mac-analiz-merkezi/tree/main/mobile
