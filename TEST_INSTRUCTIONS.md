# Test Instructions per Kronos su Hugging Face

## Passi per il Debug

### 1. Commit e Push delle modifiche
```bash
git add server.js
git commit -m "Add comprehensive logging for Hugging Face debugging"
git push
```

### 2. Riavvia lo Space su Hugging Face
- Vai su Hugging Face Spaces
- Apri il tuo Space Kronos
- Clicca su **Settings** → **Factory reboot**
- Attendi il completamento del build (3-5 minuti)

### 3. Verifica che il server sia online
Apri nel browser:
```
https://TUO-USERNAME-kronos-stremio.hf.space/health
```

Dovresti vedere:
```json
{
  "status": "ok",
  "version": "1.5.7",
  "uptime": 123.45,
  "memory": {...},
  "timestamp": "2024-..."
}
```

### 4. Genera una nuova configurazione
1. Vai su `https://TUO-USERNAME-kronos-stremio.hf.space/`
2. Inserisci la tua lista M3U
3. **NON selezionare gruppi specifici** (lascia vuoto o usa "Analizza gruppi")
4. Clicca su "Genera setup K.R.O.N.O.S."
5. Copia il link generato

### 5. Testa l'endpoint di debug
Prendi il token dalla URL generata (la parte tra lo slash dopo il dominio e `/manifest.json`)

Esempio: se il link è:
```
https://xxx.hf.space/eyJsIjpbeyJuIjoiTGlzdGEgMSIsInUiOiJodHRwOi8v...}/manifest.json
```

Il token è: `eyJsIjpbeyJuIjoiTGlzdGEgMSIsInUiOiJodHRwOi8v...`

Apri nel browser:
```
https://TUO-USERNAME-kronos-stremio.hf.space/TUO_TOKEN/debug
```

### 6. Analizza l'output del debug
Dovresti vedere qualcosa come:
```json
{
  "config": {
    "l": [...],
    "gm": "list",
    "g": []
  },
  "totalChannels": 150,
  "sampleChannels": [...],
  "uniqueGroups": ["Cinema", "Sport", "News", ...],
  "uniqueSourceNames": ["Lista 1"],
  "configuredLists": [...]
}
```

**Controlla:**
- ✅ `totalChannels` > 0
- ✅ `uniqueGroups` contiene i gruppi della tua lista M3U
- ✅ `sampleChannels` contiene canali validi

### 7. Controlla i log su Hugging Face
1. Vai nella tab **Logs** del tuo Space
2. Cerca questi messaggi:
   - `[DEBUG] Config decoded`
   - `[FETCH PLAYLIST] Attempting to fetch`
   - `[FETCH PLAYLIST] Success`
   - `[PARSE M3U] Parsed X channels`
   - `[DEBUG FETCH] Final channel count`

### 8. Testa il manifest
Apri:
```
https://TUO-USERNAME-kronos-stremio.hf.space/TUO_TOKEN/manifest.json
```

Verifica che:
- `catalogs` sia un array con almeno 1 elemento
- Ogni catalogo abbia `extra` con `name: "genre"` e `options` con i gruppi

### 9. Testa il catalogo
Apri:
```
https://TUO-USERNAME-kronos-stremio.hf.space/TUO_TOKEN/catalog/kronos/kronos_all.json
```

Dovresti vedere:
```json
{
  "metas": [
    {
      "id": "channel_...",
      "type": "kronos",
      "name": "Nome Canale",
      ...
    }
  ]
}
```

## Problemi Comuni

### Problema: totalChannels = 0
**Causa:** La playlist M3U non viene scaricata
**Soluzione:** 
- Verifica che l'URL della playlist sia accessibile pubblicamente
- Controlla i log per errori `[FETCH PLAYLIST ERROR]`
- Prova ad usare un proxy resolver se la lista richiede autenticazione

### Problema: uniqueGroups = []
**Causa:** I canali non hanno il tag `group-title` nel M3U
**Soluzione:**
- Verifica che il file M3U contenga `group-title="NomeGruppo"` nelle righe #EXTINF
- Esempio corretto:
  ```
  #EXTINF:-1 tvg-id="rai1" tvg-logo="..." group-title="Generalisti",Rai 1
  http://...
  ```

### Problema: Stremio mostra "Empty content"
**Causa:** Il catalogo non restituisce canali
**Soluzione:**
- Testa l'endpoint `/catalog/kronos/kronos_all.json`
- Verifica che `metas` non sia vuoto
- Controlla i log `[DEBUG CATALOG]`

## Informazioni da Fornire per il Debug

Se il problema persiste, fornisci:

1. **Output dell'endpoint `/debug`** (rimuovi URL sensibili)
2. **Log dalla console di Hugging Face** (ultimi 50 righe)
3. **Output del manifest** (`/manifest.json`)
4. **Configurazione usata:**
   - Numero di liste M3U
   - Hai selezionato gruppi specifici?
   - Hai usato "Analizza gruppi"?
   - Hai configurato un proxy?
