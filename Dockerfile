# Usa l'immagine ufficiale Node.js 18 basata su Alpine Linux (leggera, ~40MB)
FROM node:18-alpine

# Imposta la directory di lavoro all'interno del container
WORKDIR /app

# Copia i file di configurazione delle dipendenze npm
# Copiandoli prima del resto del codice, Docker può cachare questo layer
# e non reinstallare le dipendenze se package.json non cambia
COPY package*.json ./

# Installa solo le dipendenze di produzione (esclude devDependencies)
# npm ci è più veloce e deterministico rispetto a npm install
# --only=production esclude le dipendenze di sviluppo per ridurre le dimensioni
RUN npm ci --only=production && \
    npm cache clean --force

# Copia tutto il codice sorgente del progetto nel container
# Questo viene fatto dopo l'installazione delle dipendenze per sfruttare la cache
COPY . .

# Espone la porta 7860 richiesta da Hugging Face Spaces
# Hugging Face mappa automaticamente questa porta esternamente
EXPOSE 7860

# Imposta le variabili d'ambiente per l'applicazione
# PORT: 7860 è la porta standard di Hugging Face Spaces
# NODE_ENV: modalità produzione per ottimizzazioni di performance
ENV PORT=7860 \
    NODE_ENV=production

# Comando di avvio del server quando il container viene eseguito
# Esegue direttamente server.js con Node.js
# Il server leggerà process.env.PORT (7860) invece della porta di default
CMD ["node", "server.js"]
