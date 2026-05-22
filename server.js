const express = require("express");
const axios = require("axios");
const xml2js = require("xml2js");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 7000;

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const memoryCache = {
    channelItems: {},
    channelIndex: {},
    epgData: {},
    hlsData: {},
    logoData: {},
    lastUpdate: {},
    isUpdating: {}
};
const CACHE_TTL = 30 * 60 * 1000;
const HLS_REFRESH_TTL = 8 * 1000;
const HLS_STALE_TTL = 5 * 60 * 1000;
const ADDON_TYPE = "kronos";
const RELEASE_VERSION = "1.5.7";

function decodeConfig(configKey) {
    const normalized = String(configKey || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

app.get("/logo.svg", (req, res) => {
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
            <rect width="100" height="100" rx="20" fill="#0b0c10"/>
            <circle cx="50" cy="50" r="35" fill="none" stroke="url(#kronosGrad)" stroke-width="4" stroke-dasharray="5 3"/>
            <path d="M50 25 V50 L65 50" fill="none" stroke="#ff5e00" stroke-width="4" stroke-linecap="round"/>
            <path d="M35 50 Q50 30 65 50" fill="none" stroke="#ff007f" stroke-width="2" opacity="0.7"/>
            <path d="M25 50 Q50 15 75 50" fill="none" stroke="#38dff4" stroke-width="1.5" opacity="0.4"/>
            <defs>
                <linearGradient id="kronosGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ff5e00"/>
                    <stop offset="100%" stop-color="#ff007f"/>
                </linearGradient>
            </defs>
        </svg>
    `);
});

async function updateEPGCache(epgUrl) {
    if (!epgUrl) return {};
    try {
        const response = await axios.get(epgUrl, { timeout: 15000 });
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
        const result = await parser.parseStringPromise(response.data);
        const programmesByChannel = {};

        if (result.tv && result.tv.programme) {
            const programmes = Array.isArray(result.tv.programme) ? result.tv.programme : [result.tv.programme];
            programmes.forEach(prog => {
                if (!prog.$ || !prog.$.channel || !prog.$.start || !prog.$.stop) return;

                const start = parseXMLTVDate(prog.$.start);
                const stop = parseXMLTVDate(prog.$.stop);
                if (Number.isNaN(start.getTime()) || Number.isNaN(stop.getTime())) return;

                const channelKey = normalizeEpgId(prog.$.channel);
                if (!programmesByChannel[channelKey]) programmesByChannel[channelKey] = [];
                programmesByChannel[channelKey].push({
                    start,
                    stop,
                    title: getXmlText(prog.title) || "Programma senza titolo",
                    desc: getXmlText(prog.desc)
                });
            });
        }

        const tempEpgMap = {};
        Object.entries(programmesByChannel).forEach(([channelKey, programmes]) => {
            const selectedProgramme = selectBestProgramme(programmes);
            if (!selectedProgramme) return;

            const label = selectedProgramme.isLive ? "In onda" : "EPG disponibile";
            const desc = selectedProgramme.desc ? ` - ${selectedProgramme.desc}` : "";
            tempEpgMap[channelKey] = `${label}: ${selectedProgramme.title} (${formatTime(selectedProgramme.start)} - ${formatTime(selectedProgramme.stop)})${desc}`;
        });

        memoryCache.epgData[epgUrl] = tempEpgMap;
        return tempEpgMap;
    } catch (err) {
        return memoryCache.epgData[epgUrl] || {};
    }
}

function parseXMLTVDate(str) {
    const match = String(str || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
    if (!match) return new Date(str);

    const [, year, month, day, hour, minute, second, offset] = match;
    const timezone = offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : "Z";
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${timezone}`);
}

function getXmlText(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object" && value._) return value._;
    return "";
}

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function selectBestProgramme(programmes) {
    const now = new Date();
    const sorted = programmes.slice().sort((a, b) => a.start - b.start);
    const live = sorted.find(programme => now >= programme.start && now <= programme.stop);
    if (live) return { ...live, isLive: true };

    const future = sorted.find(programme => programme.start > now);
    if (future) return { ...future, isLive: false };

    const latest = sorted[sorted.length - 1];
    return latest ? { ...latest, isLive: false } : null;
}

function normalizeEpgId(id) {
    let key = String(id || "").toLowerCase().trim();
    key = key.replace(/\.it$/i, "");
    key = key.replace(/[^a-z0-9]/g, "");
    key = key.replace(/hd$/i, "");

    if (key === "20mediaset") return "20";
    if (key === "mediasetextra") return "mediasetextra";
    return key;
}

function getResolverPlaylistUrl(config, sourceUrl) {
    if (!config.p) return sourceUrl;

    const proxy = new URL(config.p);
    const cleanPath = proxy.pathname.replace(/\/$/, "");
    proxy.pathname = `${cleanPath}/playlist`;
    proxy.search = "";
    proxy.searchParams.set("url", sourceUrl);

    if (config.pp && proxy.username) {
        proxy.password = config.pp;
    }

    return proxy.toString();
}

function getStreamFetchUrl(config, sourceUrl) {
    if (!config.p) return sourceUrl;
    if (isHlsUrl(sourceUrl)) return sourceUrl;

    try {
        const source = new URL(sourceUrl);
        const proxy = new URL(config.p);
        const sameResolverHost = source.hostname === proxy.hostname && source.port === proxy.port;
        if (sameResolverHost) return sourceUrl;
    } catch (err) {
        return sourceUrl;
    }

    return getResolverPlaylistUrl(config, sourceUrl);
}

function getStreamCacheMode(config, sourceUrl) {
    if (!config.p) return "direct";
    if (isHlsUrl(sourceUrl)) return "hls";

    try {
        const source = new URL(sourceUrl);
        const proxy = new URL(config.p);
        if (source.hostname === proxy.hostname && source.port === proxy.port) return "resolved";
    } catch (err) {
        return "direct";
    }

    return "resolver";
}

function getConfiguredLists(config) {
    if (Array.isArray(config.l) && config.l.length) {
        return config.l
            .map((list, index) => ({
                name: String(list.n || `Lista ${index + 1}`).trim() || `Lista ${index + 1}`,
                url: String(list.u || "").trim()
            }))
            .filter(list => list.url);
    }

    return [{
        name: String(config.ln || "Kronos").trim() || "Kronos",
        url: String(config.u || "").trim()
    }].filter(list => list.url);
}

async function fetchPlaylist(config, sourceUrl) {
    const playlistUrl = getResolverPlaylistUrl(config, sourceUrl);
    const response = await axios.get(playlistUrl, {
        timeout: 30000,
        headers: {
            "User-Agent": "Kronos/1.5.7",
            "Accept": "application/x-mpegURL, audio/mpegurl, text/plain, */*"
        }
    });

    return response.data;
}

function toAbsoluteUrl(value, baseUrl) {
    try {
        return new URL(value, baseUrl).toString();
    } catch (err) {
        return value;
    }
}

function rewriteHLSPlaylist(playlist, baseUrl) {
    return String(playlist).split(/\r?\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        return toAbsoluteUrl(trimmed, baseUrl);
    }).join("\n");
}

function escapeXml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
}

async function getLogoDataUri(logoUrl) {
    if (!isHttpUrl(logoUrl)) return "";
    if (memoryCache.logoData[logoUrl]) return memoryCache.logoData[logoUrl];

    try {
        const response = await axios.get(logoUrl, {
            responseType: "arraybuffer",
            timeout: 10000,
            maxContentLength: 2 * 1024 * 1024,
            headers: {
                "User-Agent": "Kronos/1.5.7",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
            }
        });

        const contentType = String(response.headers["content-type"] || "image/png").split(";")[0];
        const dataUri = `data:${contentType};base64,${Buffer.from(response.data).toString("base64")}`;
        memoryCache.logoData[logoUrl] = dataUri;
        return dataUri;
    } catch (err) {
        return "";
    }
}

async function getCachedHLS(cacheKey, sourceUrl, config = {}) {
    const cached = memoryCache.hlsData[cacheKey];
    const now = Date.now();
    const fetchUrl = getStreamFetchUrl(config, sourceUrl);

    if (cached && now - cached.updatedAt < HLS_REFRESH_TTL) {
        return cached.playlist;
    }

    try {
        const response = await axios.get(fetchUrl, {
            timeout: 15000,
            headers: {
                "User-Agent": "Kronos/1.5.7",
                "Accept": "application/x-mpegURL, audio/mpegurl, text/plain, */*"
            }
        });

        const finalUrl = response.request?.res?.responseUrl || fetchUrl;
        const playlist = rewriteHLSPlaylist(response.data, finalUrl);
        memoryCache.hlsData[cacheKey] = { playlist, updatedAt: now };
        return playlist;
    } catch (err) {
        if (cached && now - cached.updatedAt < HLS_STALE_TTL) {
            return cached.playlist;
        }
        throw err;
    }
}

function parseM3UChannels(data, source = {}) {
    const lines = String(data || "").split("\n");
    const channels = [];
    let currentChannel = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("#EXTINF:")) {
            const name = (line.match(/,(.+)$/) || [, "Canale Sconosciuto"])[1].trim();
            const group = (line.match(/group-title="([^"]+)"/) || [, "Altri Canali"])[1].trim();
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            const tvgId = (line.match(/tvg-id="([^"]+)"/) || [, null])[1];
            const logo = logoMatch ? logoMatch[1] : `https://placehold.co/512x512/111827/ffffff?text=${encodeURIComponent(name.substring(0, 5))}`;

            currentChannel = {
                name,
                group,
                logo,
                tvgId,
                sourceName: source.name || "Kronos",
                sourceUrl: source.url || ""
            };
        } else if (line.startsWith("http") && currentChannel) {
            currentChannel.url = line;
            currentChannel.id = "channel_" + crypto.createHash("sha1").update(`${source.url || ""}|${line}`).digest("hex").substring(0, 20);
            channels.push(currentChannel);
            currentChannel = null;
        }
    }

    return channels;
}

function decorateChannelName(channel, totalLists, mode) {
    if (totalLists <= 1 || mode !== "filter") return channel.name;
    const baseName = channel.name.replace(/\s*\([^)]*\)\s*$/g, "").trim();
    return `${baseName} (${getListAbbreviation(channel.sourceName)})`;
}

function getListAbbreviation(name) {
    const clean = String(name || "LST").replace(/[^a-z0-9]/gi, "");
    return (clean || "LST").slice(0, 3);
}

function normalizeGroupName(group) {
    return String(group || "").trim().toLowerCase();
}

function getExtraParams(extra) {
    const params = {};
    if (!extra) return params;
    const cleanExtra = decodeURIComponent(extra).replace(/\.json$/i, "");
    cleanExtra.split("&").forEach(pair => {
        const [name, value] = pair.split("=");
        if (name && value) params[name] = value;
    });
    return params;
}

function getCatalogSourceName(catalogId) {
    if (catalogId === "kronos_all") return null;
    if (!String(catalogId || "").startsWith("kronos_list_")) return null;
    return Buffer.from(catalogId.replace("kronos_list_", ""), "hex").toString("utf8");
}

function toCatalogId(name) {
    if (name === "TUTTI") return "kronos_all";
    return `kronos_list_${Buffer.from(name).toString("hex")}`;
}

function sortChannelsByName(channels) {
    return channels.slice().sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
}

function buildChannelIndex(channels) {
    return channels.reduce((index, channel) => {
        index[channel.id] = channel;
        return index;
    }, {});
}

async function getChannelById(configKey, config, id) {
    let channel = memoryCache.channelIndex[configKey]?.[id];
    if (channel) return channel;

    const channels = await getChannelsFromCache(configKey, config);
    channel = channels.find(ch => ch.id === id);
    if (channel) return channel;

    await fetchAndProcessChannels(configKey, config, { force: true });
    return memoryCache.channelIndex[configKey]?.[id] || null;
}

function isPlayableHttpUrl(url) {
    return /^https?:\/\//i.test(String(url || ""));
}

function isHlsUrl(url) {
    return /\.m3u8(?:[?#].*)?$/i.test(String(url || ""));
}

function buildStream(channel, host, configKey, config) {
    if (config.p || isHlsUrl(channel.url)) {
        return {
            title: channel.name,
            name: "Kronos",
            url: `${host}/${configKey}/hls/${channel.id}/index.m3u8`,
            behaviorHints: {
                notWebReady: true,
                bingeGroup: `kronos-${channel.id}`
            }
        };
    }

    if (isPlayableHttpUrl(channel.url)) {
        return {
            title: channel.name,
            name: "Kronos",
            url: channel.url,
            behaviorHints: {
                notWebReady: true,
                bingeGroup: `kronos-${channel.id}`
            }
        };
    }

    return {
        title: `${channel.name} - sorgente web`,
        name: "Kronos",
        externalUrl: channel.url
    };
}

function toMeta(channel, host, configKey = "", config = {}) {
    const fallbackLogo = `${host}/logo.svg`;
    const poster = configKey ? `${host}/${configKey}/poster/${channel.id}.svg` : (channel.logo || fallbackLogo);
    const logo = channel.logo || fallbackLogo;
    const stream = configKey ? buildStream(channel, host, configKey, config) : null;

    return {
        id: channel.id,
        type: ADDON_TYPE,
        name: channel.name,
        poster,
        logo,
        description: channel.description,
        posterShape: "square",
        background: poster,
        genres: channel.group ? [channel.group] : undefined,
        behaviorHints: {
            defaultVideoId: channel.id,
            hasScheduledVideos: false
        },
        videos: [{
            id: channel.id,
            title: channel.name,
            released: new Date(0).toISOString(),
            thumbnail: poster,
            overview: channel.description,
            available: true,
            streams: stream ? [stream] : undefined
        }]
    };
}

async function fetchAndProcessChannels(configKey, config, options = {}) {
    if (memoryCache.isUpdating[configKey] && !options.force) return;
    memoryCache.isUpdating[configKey] = true;

    try {
        const epgMap = config.e ? await updateEPGCache(config.e) : {};
        const configuredLists = getConfiguredLists(config);
        const selectedGroups = Array.isArray(config.g) ? config.g : [];
        const selectedGroupSet = new Set(selectedGroups.map(normalizeGroupName));
        const bucketGroup = selectedGroups[0] || "Kronos";
        const parsedChannelGroups = await Promise.all(configuredLists.map(async list => {
            const playlistData = await fetchPlaylist(config, list.url);
            return parseM3UChannels(playlistData, list);
        }));

        const channels = parsedChannelGroups.flat()
            .filter(channel => {
                if (config.gm === "list") return true;
                if (config.gm === "bucket") return true;
                if (selectedGroupSet.size === 0) return true;
                return selectedGroupSet.has(normalizeGroupName(channel.group));
            })
            .map(channel => ({
                ...channel,
                name: decorateChannelName(channel, configuredLists.length, config.gm),
                group: config.gm === "list"
                    ? channel.sourceName
                    : config.gm === "bucket"
                        ? bucketGroup
                        : channel.group,
                description: channel.tvgId && epgMap[normalizeEpgId(channel.tvgId)]
                    ? epgMap[normalizeEpgId(channel.tvgId)]
                    : "K.R.O.N.O.S. - Nessun dato guida oraria"
            }));

        memoryCache.channelItems[configKey] = channels;
        memoryCache.channelIndex[configKey] = buildChannelIndex(channels);
        memoryCache.lastUpdate[configKey] = Date.now();
    } catch (err) {
        console.error("[KRONOS ERROR]", err.message);
    } finally {
        memoryCache.isUpdating[configKey] = false;
    }
}

async function getChannelsFromCache(configKey, config) {
    const cachedData = memoryCache.channelItems[configKey];
    if (!cachedData) {
        await fetchAndProcessChannels(configKey, config);
        return memoryCache.channelItems[configKey] || [];
    }
    if (!memoryCache.channelIndex[configKey]) {
        memoryCache.channelIndex[configKey] = buildChannelIndex(cachedData);
    }
    if (Date.now() - (memoryCache.lastUpdate[configKey] || 0) > CACHE_TTL) {
        fetchAndProcessChannels(configKey, config);
    }
    return cachedData;
}

app.get("/:base64Config/manifest.json", async (req, res) => {
    try {
        const configKey = req.params.base64Config;
        const config = decodeConfig(configKey);
        const channels = await getChannelsFromCache(configKey, config);
        const host = `${req.protocol}://${req.get("host")}`;

        res.json({
            id: "org.stremio.kronos.channel",
            version: RELEASE_VERSION,
            name: "Kronos",
            description: "TV",
            logo: `${host}/logo.svg`,
            resources: ["catalog", "meta", "stream"],
            types: [ADDON_TYPE],
            idPrefixes: ["channel_"],
            behaviorHints: {
                configurable: true,
                configurationRequired: false
            },
            catalogs: ["TUTTI", ...getConfiguredLists(config).map(list => list.name)].map(listName => {
                const catalogChannels = listName === "TUTTI"
                    ? channels
                    : channels.filter(channel => channel.sourceName === listName);
                const catalogGroups = [...new Set(catalogChannels.map(c => c.group))]
                    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

                return {
                    id: toCatalogId(listName),
                    type: ADDON_TYPE,
                    name: listName,
                    extra: [{
                        name: "genre",
                        options: catalogGroups,
                        isRequired: false
                    }]
                };
            })
        });
    } catch (err) {
        res.status(500).json({ error: "Errore Token" });
    }
});

app.post("/api/analyze-link", async (req, res) => {
    try {
        const config = {
            p: req.body.proxyUrl || null,
            pp: req.body.proxyPassword || null
        };
        const playlistData = await fetchPlaylist(config, req.body.url);
        const channels = parseM3UChannels(playlistData, {
            name: req.body.name || "Lista",
            url: req.body.url
        });
        const groupMap = new Map();

        channels.forEach(channel => {
            groupMap.set(channel.group, (groupMap.get(channel.group) || 0) + 1);
        });

        const groups = [...groupMap.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        res.json({ totalChannels: channels.length, groups });
    } catch (err) {
        res.status(400).json({ error: "Impossibile analizzare la lista M3U" });
    }
});

app.post("/api/analyze-lists", async (req, res) => {
    try {
        const config = {
            p: req.body.proxyUrl || null,
            pp: req.body.proxyPassword || null
        };
        const lists = getConfiguredLists({ l: req.body.lists || [] });
        const parsedChannelGroups = await Promise.all(lists.map(async list => {
            const playlistData = await fetchPlaylist(config, list.url);
            return parseM3UChannels(playlistData, list);
        }));
        const channels = parsedChannelGroups.flat();
        const groupMap = new Map();

        channels.forEach(channel => {
            const current = groupMap.get(channel.group) || { name: channel.group, count: 0, sources: new Set() };
            current.count += 1;
            current.sources.add(channel.sourceName);
            groupMap.set(channel.group, current);
        });

        const groups = [...groupMap.values()]
            .map(group => ({ name: group.name, count: group.count, sources: [...group.sources] }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        res.json({ totalChannels: channels.length, totalLists: lists.length, groups });
    } catch (err) {
        res.status(400).json({ error: "Impossibile analizzare le liste M3U" });
    }
});

async function catalogResponse(req, res) {
    const configKey = req.params.base64Config;
    const config = decodeConfig(configKey);
    const channels = await getChannelsFromCache(configKey, config);
    const extraParams = getExtraParams(req.params.extra);
    const targetGroup = extraParams.genre || null;
    const targetSource = getCatalogSourceName(req.params.id);
    const host = `${req.protocol}://${req.get("host")}`;
    const filteredChannels = sortChannelsByName(channels.filter(channel => {
        const matchesSource = targetSource ? channel.sourceName === targetSource : true;
        const matchesGroup = targetGroup ? normalizeGroupName(channel.group) === normalizeGroupName(targetGroup) : true;
        return matchesSource && matchesGroup;
    }));

    const metas = filteredChannels.map(c => toMeta(c, host, configKey, config));
    res.json({ metas });
}

app.get("/:base64Config/catalog/:type/:id.json", catalogResponse);
app.get("/:base64Config/catalog/:type/:id/:extra.json", catalogResponse);

app.get("/:base64Config/meta/:type/:id.json", async (req, res) => {
    const configKey = req.params.base64Config;
    const config = decodeConfig(configKey);
    const c = await getChannelById(configKey, config, req.params.id);
    const host = `${req.protocol}://${req.get("host")}`;
    if (!c) return res.status(404).json({ meta: null });
    res.json({ meta: toMeta(c, host, configKey, config) });
});

app.get("/:base64Config/poster/:id.svg", async (req, res) => {
    try {
        const configKey = req.params.base64Config;
        const config = decodeConfig(configKey);
        const c = await getChannelById(configKey, config, req.params.id);
        const host = `${req.protocol}://${req.get("host")}`;
        const logoUrl = c?.logo || `${host}/logo.svg`;
        const logoDataUri = await getLogoDataUri(logoUrl);
        const name = c?.name || "Kronos";
        const initials = name
            .replace(/\([^)]*\)/g, "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0])
            .join("")
            .toUpperCase() || "TV";
        const logoMarkup = logoDataUri
            ? `<image href="${escapeXml(logoDataUri)}" x="58" y="74" width="396" height="286" preserveAspectRatio="xMidYMid meet"/>`
            : `<text x="256" y="274" text-anchor="middle" fill="#111827" font-family="Arial, sans-serif" font-size="86" font-weight="800">${escapeXml(initials)}</text>`;

        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "public, max-age=604800");
        res.send(`
            <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
                <defs>
                    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0" stop-color="#111827"/>
                        <stop offset="1" stop-color="#050814"/>
                    </linearGradient>
                </defs>
                <rect width="512" height="512" rx="56" fill="url(#bg)"/>
                <rect x="28" y="28" width="456" height="456" rx="44" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.16)"/>
                <rect x="46" y="58" width="420" height="318" rx="32" fill="#f8fafc"/>
                ${logoMarkup}
                <text x="256" y="424" text-anchor="middle" fill="#f5f7fb" font-family="Arial, sans-serif" font-size="30" font-weight="700">${escapeXml(name.slice(0, 34))}</text>
            </svg>
        `);
    } catch (err) {
        res.status(404).send("");
    }
});

app.get("/:base64Config/hls/:id/index.m3u8", async (req, res) => {
    try {
        const configKey = req.params.base64Config;
        const config = decodeConfig(configKey);
        const c = await getChannelById(configKey, config, req.params.id);
        if (!c) return res.status(404).send("#EXTM3U\n");

        const cacheKey = `${configKey}:${c.id}:${getStreamCacheMode(config, c.url)}`;
        const playlist = await getCachedHLS(cacheKey, c.url, config);

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.send(playlist);
    } catch (err) {
        res.status(502).send("#EXTM3U\n#EXT-X-ENDLIST\n");
    }
});

app.get("/:base64Config/stream/:type/:id.json", async (req, res) => {
    const configKey = req.params.base64Config;
    const config = decodeConfig(configKey);
    const c = await getChannelById(configKey, config, req.params.id);
    if (!c) return res.json({ streams: [] });

    const host = `${req.protocol}://${req.get("host")}`;
    const stream = buildStream(c, host, configKey, config);

    res.json({ streams: [stream] });
});

app.get("/configure", (req, res) => {
    res.redirect("/");
});

app.get("/:base64Config/configure", (req, res) => {
    res.redirect(`/?config=${encodeURIComponent(req.params.base64Config)}`);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`K.R.O.N.O.S. pronto su http://0.0.0.0:${PORT}`);
});
