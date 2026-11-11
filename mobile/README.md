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