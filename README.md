---
title: Kronos Stremio Addon
emoji: 📺
colorFrom: orange
colorTo: pink
sdk: docker
pinned: false
app_port: 7860
---

# K.R.O.N.O.S. - Kanal Routing Optimized Network On Stremio

Addon configuratore di canali TV per Stremio che supporta:

- 📺 Liste M3U multiple
- 📋 Guida EPG (Electronic Program Guide)
- 🔄 Proxy resolver per stream
- 🎯 Filtri per gruppi di canali

## 🚀 Deploy su Hugging Face Spaces

### Prerequisiti
- Account GitHub (gratuito)
- Account Hugging Face (gratuito)

### Passo 1: Fork del progetto su GitHub

1. Vai al repository originale: `https://github.com/TUO_USERNAME/Kronos`
2. Clicca sul pulsante **Fork** in alto a destra
3. Seleziona il tuo account GitHub come destinazione
4. Attendi che GitHub completi il fork del repository
5. Ora hai una copia del progetto nel tuo account: `https://github.com/TUO_USERNAME/Kronos`

### Passo 2: Creare uno Space su Hugging Face

1. Vai su [huggingface.co](https://huggingface.co) ed effettua il login
2. Clicca sul tuo avatar in alto a destra e seleziona **New Space**
3. Compila il form:
   - **Space name**: `kronos-stremio` (o un nome a tua scelta)
   - **License**: Seleziona una licenza (es. MIT)
   - **Select the Space SDK**: Scegli **Docker**
   - **Space hardware**: Lascia **CPU basic - Free** (sufficiente per questo addon)
4. Clicca su **Create Space**

### Passo 3: Collegare GitHub a Hugging Face

1. Una volta creato lo Space, vai nella tab **Settings** (in alto)
2. Scorri fino alla sezione **Repository**
3. Clicca su **Link to GitHub**
4. Autorizza Hugging Face ad accedere al tuo account GitHub
5. Seleziona il repository **Kronos** che hai forkato
6. Clicca su **Link repository**

### Passo 4: Deploy automatico

1. Hugging Face rileverà automaticamente il `Dockerfile` nel repository
2. Inizierà il build dell'immagine Docker (può richiedere 3-5 minuti)
3. Puoi seguire i log del build nella tab **Logs**
4. Quando il build è completato, lo Space sarà automaticamente online
5. L'addon sarà accessibile all'URL: `https://huggingface.co/spaces/TUO_USERNAME/kronos-stremio`

### Passo 5: Aggiornamenti automatici

Ogni volta che fai un commit sul tuo repository GitHub:
1. Hugging Face rileverà automaticamente le modifiche
2. Farà un nuovo build dell'immagine Docker
3. Aggiornerà lo Space con la nuova versione

## 📖 Utilizzo dell'Addon

1. Accedi all'interfaccia web del tuo Space: `https://huggingface.co/spaces/TUO_USERNAME/kronos-stremio`
2. Configura le tue liste M3U:
   - Inserisci il nome della lista
   - Inserisci l'URL della playlist M3U
   - Puoi aggiungere più liste cliccando su "Aggiungi lista"
3. (Opzionale) Aggiungi l'URL della guida EPG in formato XML
4. (Opzionale) Seleziona i gruppi di canali da includere:
   - Clicca su "Analizza gruppi da tutte le liste" per vedere i gruppi disponibili
   - Seleziona i gruppi desiderati
   - Clicca su "Inserisci gruppi selezionati"
5. (Opzionale) Configura un proxy resolver se necessario
6. Clicca su **Genera setup K.R.O.N.O.S.**
7. Copia il link generato o clicca su **Installa in Stremio**
8. Il tuo addon sarà disponibile in Stremio con tutti i canali configurati

## 🔧 Configurazione Avanzata

### Proxy Resolver
Se le tue liste M3U o gli stream richiedono un proxy:
1. Attiva l'opzione "Resolver proxy"
2. Inserisci l'URL del proxy (es. `http://192.168.1.100:8080`)
3. Se il proxy richiede autenticazione, inserisci la password

### Modalità Gruppi
L'addon supporta tre modalità di organizzazione:
- **Lista**: Ogni lista M3U diventa un catalogo separato
- **Bucket**: Tutti i canali vengono raggruppati in un unico gruppo
- **Filter**: Filtra i canali per gruppi specifici (richiede analisi)

## 📝 Note Tecniche

- **Versione**: 1.5.7
- **Porta locale**: 7000 (sviluppo)
- **Porta Hugging Face**: 7860 (produzione)
- **Node.js**: >= 18
- **Dipendenze**: Express, Axios, xml2js, https-proxy-agent
- **Cache**: 30 minuti per canali, 8 secondi per stream HLS

## 🐛 Troubleshooting

### Lo Space non si avvia
- Controlla i log nella tab **Logs** dello Space
- Verifica che il Dockerfile sia presente nel repository
- Assicurati che `app_port: 7860` sia impostato nel README.md

### L'addon non funziona in Stremio
- Verifica che l'URL dello Space sia raggiungibile
- Controlla che le liste M3U siano valide e accessibili
- Se usi localhost, funzionerà solo sullo stesso PC

### Gli stream non partono
- Verifica che gli URL degli stream siano validi
- Se necessario, configura un proxy resolver
- Controlla che l'EPG (se configurato) sia in formato XMLTV valido

## 📄 Licenza

Questo progetto è distribuito sotto licenza MIT. Sei libero di usarlo, modificarlo e distribuirlo.

## 🤝 Contributi

I contributi sono benvenuti! Sentiti libero di:
- Aprire issue per bug o richieste di funzionalità
- Fare pull request con miglioramenti
- Condividere il progetto con altri utenti Stremio
