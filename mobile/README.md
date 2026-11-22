# MRTYLT ANALİZ — Mobil Uygulama

Expo / React Native başlangıç projesi.

## Expo Snack'e aktarma
Snack > Project > Import git repository:
https://github.com/mahmetisildak34/mac-analiz-merkezi/tree/main/mobile

Bu klasör web uygulamasından ayrıdır. Web uygulamasının index.html dosyasına dokunmaz.

## Veri bağlantısı
Cloudflare Worker üzerinden API-Football:
- Canlı maçlar: /api/fixtures?live=all
- Günün fikstürü: /api/fixtures?date=YYYY-MM-DD&timezone=Europe/Istanbul

Not: Canlı maç verileri API planı, kota ve maç takvimine bağlıdır.
## Bağımsız mobil derleme

Node 22 ile `npm ci` çalıştırın. Geliştirme için `npm run android` veya
`npm run ios` komutunu kullanın. iOS derlemesi macOS ve Xcode gerektirir.

`EXPO_PUBLIC_MAM_API_BASE` ayarına izinli test servisinin HTTPS API kökünü
yazın. Ayar boşsa uygulama ağ isteği göndermez. Expo bu değişkeni uygulamaya
gömer. Ayarda parola, token veya API anahtarı kullanmayın.

Bağımsız GitHub iş akışı Android debug ve imzasız iOS simülatör derlemelerini
çalıştırır. Uygulama kimliği `com.macanalizmerkezi.app` yerel derleme
yapılandırmasıdır. Mağaza yayını için hesap ve imzalama ayarları ayrıdır.
