# API-Football / ESPN inceleme raporu

**Tarih:** 24 Kasım 2026  
**Repo:** `mahmetisildak34/mac-analiz-merkezi`  
**Çalışma dalı:** `fix/uefa-upcoming-separation-20261124`  
**Kapsam:** Salt-okunur erişim denetimi, ücretsiz kaynak karşılaştırması ve güvenli dalda düşük riskli düzeltme. Merge, deploy, Worker, D1 ve Poisson motoru değiştirilmedi.

## API-Football erişim sonucu

Mevcut Cloudflare Worker çevrimiçi: `/status` HTTP 200 verdi. D1 arşiv tanısı `/api/archive/d1-status` HTTP 200 verdi. Ancak API-Football tanı rotası `/api/football/status` ve doğrudan API rotaları kimliksiz çağrıda HTTP 401 `Authentication required` döndürdü. Bu yanıt Worker kimlik doğrulamasında oluştu; API-Football sağlayıcısına ulaşan başarılı veya başarısız bir sağlayıcı sorgusu kanıtı oluşturmadı.

Bu nedenle bu incelemede API-Football sağlayıcı sorgusu tüketimi **0** olarak kaydedildi. Denenen Worker yolları şunlardı: `/api/football/status`; `/api/fixtures?league=39&season=2026`; `/api/standings?league=39&season=2026`; `/api/teams?league=39&season=2026`; `/api/fixtures?league=2&season=2026`. Hepsi sağlayıcıya geçmeden 401 döndürdü. `/status`, `/auth/check` ve `/api/archive/d1-status` kontrolleri sağlayıcı kotasına dahil değildir.

API-Football erişimini gerçekten doğrulamak için uygulamanın `/auth/login` akışından alınmış geçerli `mam_session_token` veya aynı yetkiyi taşıyan Worker oturumu gerekir. Sandbox içinde Worker parolası, oturum token’ı veya API-Football secret’ı bulunmadığından kimlik doğrulamayı aşmaya, tahmin etmeye veya gereksiz denemeler yapmaya çalışılmadı. API-Football resmi dokümantasyonunda `/status` hesabın planını ve günlük kullanımını gösteren tanı yolu olarak belirtilir; bu raporda o yanıt alınamadı. [1]

## Gerçek ESPN karşılaştırma kanıtı

ESPN’in herkese açık scoreboard yanıtları gerçek tarih, turnuva, ev/deplasman ve durum alanlarıyla okunabildi. 24 Kasım 2026 tarihli Şampiyonlar Ligi scoreboard’unda 9 gelecek etkinliği bulundu; örnek `401915380` numaralı Bodo/Glimt–LASK Linz maçında ev/deplasman rolleri ve `pre` durumu açıkça yer aldı. [2]

26 Kasım 2026 tarihli ayrı ESPN scoreboard’larında Avrupa Ligi için `401915506` Besiktas–Hapoel Be'er, Konferans Ligi için `401915816` Kairat Almaty–Mjällby AIF gibi gelecek maçlar bulundu. Bu iki farklı ESPN slug’ı aynı takım adı eşleşmesinden bağımsız olarak farklı turnuva kaynaklarıdır. [3] [4] Gerçek tarayıcı kabul testi bu üç UEFA ligini ayrı `leagueId` değerleriyle çalıştıracak şekilde genişletildi: `2` Şampiyonlar Ligi, `3` Avrupa Ligi ve `848` Konferans Ligi.

ESPN ve API-Football kayıtlarını doğrudan aynı fikstür kimliğiyle eşleştiren sağlayıcı karşılaştırması, API-Football Worker oturumu alınamadığı için tamamlanamadı. Bu sınırlama eksik veri nedenine ilişkin kesin API-Football sağlayıcı teşhisi değildir; ancak uygulamadaki UEFA gelecek fikstürü karışması, gerçek ESPN turnuva kaynakları ve kaynak kodu üzerinden bağımsız olarak doğrulanabilir.

## Doğrulanmış uygulama hatası ve düzeltme

`index.html` içindeki `openStandingTeamHistory` UEFA yolunda önce üç feed’i aynı anda tanımlıyor ve takım adına göre hepsini birleştiriyordu. Bu davranış, seçili takım Şampiyonlar Ligi tablosunda olsa bile Avrupa Ligi veya Konferans Ligi’ndeki aynı adlı takım maçlarının seçili turnuvanın gelecek listesine girmesine izin veriyordu. Sonuç nesnesinde `league.id` korunmasına rağmen filtreleme son aşamada yalnızca takım adına yapıldığı için turnuva karışması mümkündü.

Güvenli dalda bu blok seçili `leagueId` için tek feed seçer: `2 -> champions-league`, `3 -> europa-league`, `848 -> conference-league`. Artık yalnızca `[selectedFeed]` yükleniyor. Cache anahtarı `v6` yapıldı ve hata mesajı da üç kupayı birlikte ifade etmeyecek şekilde düzeltildi. Bu değişiklik geçmiş maç feed’lerine, iç saha/deplasman eşleşmesine, Worker’a, D1’e, tasarıma ve Poisson motoruna dokunmaz. API-Football’ın genel `team + next` fallback yolu ve diğer liglerin kaynak yolları değiştirilmedi.

Yeni `tests/uefa-feed-separation.test.mjs` regresyon testi seçili feed eşlemesini, tek feed yüklemesini ve normalize edilen kayıtta seçili turnuva kimliğinin korunmasını denetler. Gerçek ESPN tarayıcı testi de Şampiyonlar Ligi, Avrupa Ligi ve Konferans Ligi örneklerini kapsar.

`tests/uefa-feed-separation.test.mjs` ile `tests/live-fixture-preservation.test.mjs` birlikte çalıştırıldığında 12/12 test geçti. `index.html` içindeki 7 inline JavaScript bloğu `node --check` ile doğrulandı ve `git diff --check` temiz sonuç verdi. `tests/espn-upcoming-real-browser.test.mjs` gerçek tarayıcı testi bu sandbox’ta çalıştırılamadı; `playwright` Node paketi kurulu değil. Bunun yerine aynı üç ESPN scoreboard’ı doğrudan gerçek HTTP JSON yanıtlarıyla tekrar okundu ve Şampiyonlar Ligi’nde 9/9, Avrupa Ligi’nde 18/18, Konferans Ligi’nde 18/18 gelecek (`pre`) etkinlik görüldü.

## Kotayı koruma kaydı

API-Football günlük 100 sorguluk paketi için bu incelemede sağlayıcı sorgusu kullanılmadı; tüketim **0/100**, üst sınır **20** korunmuştur. Gerçek API-Football durum ve veri karşılaştırması, yalnızca geçerli Worker oturumu sağlanırsa ve toplam sağlayıcı çağrısı 20’yi geçmeyecek şekilde yapılmalıdır.

## References

[1]: https://www.api-football.com/documentation-v3 "API-Football v3 documentation"
[2]: https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20261124 "ESPN UEFA Champions League scoreboard for 2026-11-24"
[3]: https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard?dates=20261126 "ESPN UEFA Europa League scoreboard for 2026-11-26"
[4]: https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/scoreboard?dates=20261126 "ESPN UEFA Conference League scoreboard for 2026-11-26"
