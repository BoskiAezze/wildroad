# WildRoad - Hosting Guide

## OPCJA 1: GitHub Pages (najprościej, 2 minuty)

1. Wejdz na https://github.com i zaloguj sie (lub zaloz konto)
2. Kliknij "New repository" -> nazwa np. `wildroad`, ustaw **Public**
3. Kliknij "uploading an existing file" i wrzuc `index.html`
4. Idz do Settings -> Pages -> Branch: `main` -> Save
5. Po ~1 min aplikacja bedzie pod: `https://TWOJ-LOGIN.github.io/wildroad/`

Zalety: darmowe, HTTPS, zero konfiguracji
Wady: publiczny repo (ale PIN chroni aplikacje)


## OPCJA 2: Cloudflare Pages (szybsze, wlasna domena mozliwa)

1. Zaloz konto na https://dash.cloudflare.com
2. Idz do Workers & Pages -> Create -> Pages -> Upload assets
3. Nazwij projekt np. `wildroad`
4. Przeciagnij folder z `index.html` -> Deploy
5. Gotowe pod: `wildroad.pages.dev`

Zalety: darmowe, bardzo szybki CDN, mozliwosc wlasnej domeny
Wady: trzeba konto Cloudflare


## OPCJA 3: NAS z Windows 11 + Cloudflare Tunnel (pelna kontrola)

### Krok A: Wlacz IIS na Windows 11

1. Panel sterowania -> Programy -> Wlacz/wylacz funkcje systemu
2. Zaznacz "Internet Information Services" (IIS)
3. Kliknij OK, poczekaj na instalacje
4. Skopiuj `index.html` do `C:\inetpub\wwwroot\wildroad\`
5. Otworz przegladarke: `http://localhost/wildroad/` - powinno dzialac

### Krok B: Cloudflare Tunnel (dostep z zewnatrz BEZ stalego IP)

1. Zaloz konto na https://dash.cloudflare.com (darmowe)
2. Dodaj darmowa domene lub uzyj subdomain cloudflare
3. Idz do: Zero Trust -> Networks -> Tunnels -> Create tunnel
4. Wybierz "Cloudflared" -> Windows
5. Pobierz i zainstaluj `cloudflared.msi` na NAS
6. Skopiuj token z dashboardu i uruchom:
   ```
   cloudflared service install <TOKEN>
   ```
7. W dashboardzie dodaj Public Hostname:
   - Subdomain: `wildroad`
   - Domain: twoja-domena lub .cfargotunnel.com
   - Service: HTTP://localhost:80
   - Path: /wildroad

Gotowe! Aplikacja dostepna pod np. `https://wildroad.twoja-domena.com`

Zalety:
- Pelna kontrola nad danymi (wszystko na Twoim NAS)
- HTTPS automatycznie (Cloudflare)
- Dziala mimo zmiennego IP (tunnel laczy sie z Cloudflare)
- Zero otwartych portow na routerze
- Darmowe

### Alternatywa bez domeny: Cloudflare Quick Tunnels

Na NAS w CMD/PowerShell:
```
cloudflared tunnel --url http://localhost:80
```
Daje tymczasowy URL (np. `https://random-words.trycloudflare.com`)
- bez rejestracji, bez konfiguracji
- URL zmienia sie po kazdym uruchomieniu


## OPCJA 4: Netlify Drop (drag & drop, 30 sekund)

1. Wejdz na https://app.netlify.com/drop
2. Przeciagnij folder z `index.html`
3. Gotowe! Dostaniesz URL typu `random-name.netlify.app`
4. Mozesz zmienic nazwe w Site settings

Zalety: najszybszy deploy, darmowe, HTTPS
Wady: po 30 dniach bez konta strona znika


## Porownanie

| Opcja             | Koszt | HTTPS | Wlasna domena | Dane na Twoim serwerze | Czas setup |
|-------------------|-------|-------|---------------|------------------------|------------|
| GitHub Pages      | $0    | Tak   | Tak (opcja)   | Nie                    | 2 min      |
| Cloudflare Pages  | $0    | Tak   | Tak (opcja)   | Nie                    | 3 min      |
| NAS + CF Tunnel   | $0    | Tak   | Tak (opcja)   | Tak                    | 15 min     |
| Netlify Drop      | $0    | Tak   | Nie           | Nie                    | 30 sek     |

## Zabezpieczenie

Aplikacja jest chroniona PINem `1234` - mozna go zmienic w pliku index.html:
```js
const APP_PIN = '1234';  // zmien na swoj PIN
```
PIN jest sprawdzany per sesje przegladarki (po zamknieciu i otwarciu trzeba wpisac ponownie).
