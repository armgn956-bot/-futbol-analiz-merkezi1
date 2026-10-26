# Futbol Analiz Merkezi v2

## Özellikler
- football-data.org üzerinden erişilebilir ligleri ve maçları sunucu tarafında listeler.
- Seçilen maçın tarihinden önceki tamamlanmış maçlardan son 10 maçlık form görünümü çıkarır.
- 50.000 Monte Carlo tekrarında 1X2, beklenen goller, karşılıklı gol, 1.5/2.5/3.5 alt-üst ve skor matrisi hesaplar.
- Simülasyon raporunu CSV olarak dışa aktarır.
- API token'ını tarayıcıya göndermez.

## Yerel çalıştırma
Node.js 18+ gerekir.
1. `npm install`
2. Ortam değişkeni `FOOTBALL_DATA_TOKEN` olarak kendi token'ını ekle.
3. `npm start`
4. `http://localhost:3000` adresini aç.

macOS/Linux:
`FOOTBALL_DATA_TOKEN=tokeniniz npm start`

PowerShell:
`$env:FOOTBALL_DATA_TOKEN="tokeniniz"; npm start`

## İnternette yayınlama
Node.js destekli bir hosting seç. Dosyaları yükle, start komutunu `npm start` olarak ayarla ve `FOOTBALL_DATA_TOKEN` değerini hosting panelindeki Environment Variables / Secrets bölümüne gir. Token'ı HTML dosyasına yazma. Hosting'in verdiği URL'yi telefondan aç.

## Veri kapsamı ve sınırlamalar
- API hesabının lig ve geçmiş maç kapsamı plana göre değişir.
- Model yalnızca seçilen lig endpoint'inden dönen maçları kullanır.
- Son 10 maçlık form, seçilen maç tarihinden önceki tamamlanmış maçlarla sınırlandırılır.
- Model xG, sakatlık, ilk 11, oyuncu kalitesi veya rakip gücünü tam olarak değerlendirmez.
- Bu proje istatistiksel analiz ve öğrenme içindir; maç sonucu garantisi vermez.
