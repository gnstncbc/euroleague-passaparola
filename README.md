# EuroLeague Passaparola

Modern EuroLeague (2000 sonrası) temalı passaparola oyunu. A–Z, 4 dakika, mobil ve masaüstü uyumlu.

- **Oyun:** `/`
  - **Günlük** (varsayılan): herkese her gün aynı 26 soru, tek hak, 4 dakika. Gece yarısı (TSİ) yenilenir; seçilen set Redis'te saklanır ve sorular harf harf sırayla döner.
  - **Serbest:** rastgele sorularla sınırsız oyun; ayarlardan süre ve "sadece EuroLeague" seçilebilir.
- **Admin paneli:** `/admin`
  - Sorular: görüntüle, ekle, düzenle, sil, kategori (EuroLeague / Genel basketbol), JSON içe/dışa aktar
  - İstatistikler: en zor sorular, en çok boş bırakılanlar, doğruya yakın yanlış cevaplar (tek tıkla alternatif cevap olarak eklenir)

## Branch akışı

- `develop` → geliştirme (Vercel'de preview deploy)
- `main` → canlı (Vercel production). Sadece "deploy edebiliriz" onayından sonra `develop` → `main` merge edilir.

## Vercel kurulumu

1. Vercel'de **Add New → Project** ile bu repoyu import et. Framework otomatik olarak Next.js seçilir.
   **Settings → Git → Production Branch** = `main` olduğundan emin ol.
2. **Storage → Upstash for Redis** (Marketplace) ekle ve projeye bağla. `KV_REST_API_URL` ve
   `KV_REST_API_TOKEN` otomatik eklenir. (Alternatif isimler `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` de çalışır.)
3. **Settings → Environment Variables** kısmına `ADMIN_PASSWORD` ekle.
4. Yeniden deploy et. İlk açılışta `src/data/seed-questions.json` içindeki sorular Redis'e yüklenir;
   bundan sonra kaynak Redis'tir, admin panelindeki değişiklikler anında canlıya yansır.

Redis bağlı değilse uygulama yine çalışır ama sorular bellekte tutulur (değişiklikler kalıcı olmaz, admin panelinde uyarı çıkar).

## Redis anahtarları

| Anahtar | İçerik |
|---|---|
| `pp:questions` | Sorular (hash, id → soru) |
| `pp:seedVersion`, `pp:deleted` | Varsayılan soruların birleştirilmesi / silinenlerin takibi |
| `pp:daily:<tarih>`, `pp:dailyLast` | Günün soru seti ve soruların son kullanıldığı gün |
| `pp:qstats`, `pp:wrong` | Soru bazında doğru/yanlış/boş sayıları ve yanlış cevaplar |

## Cevap eşleştirme

`src/lib/match.ts` — cevaplar şu esnekliklerle kabul edilir:

- büyük/küçük harf, Türkçe karakterler ve aksanlar (`Dončić` = `doncic` = `dönçiç`)
- küçük yazım hataları (Levenshtein, uzunluğa göre tolerans) ve kaba fonetik benzerlik (`Yasikevicius`)
- çok kelimeli cevaplarda son kelime(ler): soyad, `Efes`, `Tel Aviv`
- biraz eksik yazılmış cevaplar (en az %60'ı yazılmış ön ek)
- admin panelinden eklenen alternatif cevaplar

Tek başına ad (`Sergio`) veya alakasız kısa kelimeler kabul edilmez. Admin panelindeki **Cevabı dene** kutusuyla
bir yazımın kabul edilip edilmeyeceğini kaydetmeden görebilirsin.

## Geliştirme

```bash
npm install
npm run dev        # http://localhost:3000 (lokalde admin şifresi: admin)
npm test           # cevap eşleştirme + soru seti testleri
npm run build
```
