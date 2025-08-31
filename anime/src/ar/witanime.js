// --- METADATA ---
const mangayomiSources = [{
    "name": "WitAnime",
    "id": 6018541085,
    "lang": "ar",
    "baseUrl": "https://witanime.rest",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=witanime.rest",
    "typeSource": "single",
    "itemType": 1,
    "version": "2.0.2",
    "pkgPath": "anime/src/ar/witanime.js"
}];



function unpackJs(packedJS) {
    try {
        const match = packedJS.match(/}\s*\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/);
        if (!match) return packedJS;

        let payload = match[1].replace(/\\'/g, "'");
        const radix = parseInt(match[2]);
        let count = parseInt(match[3]);
        const symtab = match[4].split('|');

        if (symtab.length !== count) return packedJS;

        const unbase = (str) => parseInt(str, radix);

        return payload.replace(/\b\w+\b/g, (word) => {
            const index = unbase(word);
            return (index < count && symtab[index] && symtab[index] !== "") ? symtab[index] : word;
        });
    } catch (e) {
        return packedJS;
    }
}


class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders(refererUrl) {
        return {
            "Referer": refererUrl || this.source.baseUrl,
        };
    }

    async _request(url) {
        const res = await this.client.get(url);
        return new Document(res.body);
    }

    _getIntFromText(text) {
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : null;
    }

    // Custom Base64 decoder to handle potential UTF-8 characters in URLs
    decodeBase64(str) {
        const decoded = atob(str);
        try {
            return decodeURIComponent(Array.prototype.map.call(decoded, function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
        } catch (e) {
            return decoded;
        }
    }

    _parseAnime(element) {
        const a = element.selectFirst("div.hover > a");
        const url = a.getHref
            .replace(/-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-.*$/, "")
            .replace("/episode/", "/anime/");

        const name = element.selectFirst("div.hover > img").attr("alt");
        const imageUrl = element.selectFirst("div.hover > img").getSrc;

        return {
            name,
            link: url,
            imageUrl
        };
    }

    async getPopular(page) {
        if (page > 1) return { list: [], hasNextPage: false };

        const doc = await this._request(this.source.baseUrl);
        const list = [];
        const sections = doc.select(".page-content-container");

        for (const section of sections) {
            const items = section.select("div.anime-card-container, div.episodes-card-container");
            for (const item of items) {
                list.push(this._parseAnime(item));
            }
        }
        const uniqueList = Array.from(new Set(list.map(a => a.link)))
            .map(link => list.find(a => a.link === link));

        return {
            list: uniqueList,
            hasNextPage: false
        };
    }

    async getLatestUpdates(page) {
        return this.getPopular(page);
    }

    async search(query, page, filters) {
        if (page > 1) return { list: [], hasNextPage: false };

        const url = `${this.source.baseUrl}/?search_param=animes&s=${encodeURIComponent(query)}`;
        const doc = await this._request(url);
        const list = doc.select("div.row.display-flex > div").map(it => this._parseAnime(it));

        return {
            list,
            hasNextPage: false
        };
    }

    async getDetail(url) {
        const doc = await this._request(url);
        const name = doc.selectFirst("h1.anime-details-title").text;
        const imageUrl = doc.selectFirst("div.anime-thumbnail img").getSrc;
        const description = doc.selectFirst("p.anime-story").text;

        const yearText = doc.selectFirst("div.anime-info:contains(بداية العرض)")?.text || "";
        const year = this._getIntFromText(yearText);

        const isDubbed = name.includes("مدبلج");

        const chapters = [];
        // This is the final, correct selector based on your working JavaScript snippet.
        // It selects the inner .episodes-card which is inside .episodes-card-container.
        const episodeElements = doc.select("div#DivEpisodesList .episodes-card-container .episodes-card");

        for (const el of episodeElements) {
            const a = el.selectFirst("a[onclick*='openEpisode']");
            const img = el.selectFirst("img.img-responsive");

            if (!a || !img) {
                continue;
            }

            const chapterName = img.attr("alt");
            const onclickAttr = a.attr("onclick");

            const base64Match = onclickAttr.match(/openEpisode\('(.*?)'\)/);
            if (!base64Match || !base64Match[1]) {
                continue;
            }

            const base64String = base64Match[1];
            const chapterUrl = this.decodeBase64(base64String);

            chapters.push({
                name: chapterName.trim(),
                url: chapterUrl,
                scanlator: isDubbed ? "Dubbed" : "Subbed",
            });
        }

        return {
            name,
            imageUrl,
            description,
            year,
            chapters: chapters.reverse(),
            link: url
        };
    }

    // --- VIDEO EXTRACTION (No changes needed) ---

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const videos = [];
        const showEmbedUrl = this.getPreference("show_embed_url_in_quality");

        const getScriptVariable = (name, body) => {
            const match = new RegExp(`var ${name} = (.*?);`).exec(body);
            if (!match) throw new Error(`Could not find decryption variable: ${name}`);
            return JSON.parse(JSON.stringify(eval(`(${match[1]})`)));
        };

        let p_vars = {}, s_var, a_var, m_var;
        try {
            for (let i = 0; i <= 8; i++) {
                p_vars[`p${i}`] = getScriptVariable(`_p${i}`, res.body);
            }
            s_var = getScriptVariable('_s', res.body);
            a_var = getScriptVariable('_a', res.body);
            m_var = getScriptVariable('_m', res.body);
        } catch (e) {
            console.error("Failed to extract decryption keys from page:", e.message);
            return [];
        }

        const decryptUrl = (index) => {
            try {
                const hexToString = (hex) => {
                    let str = '';
                    for (let i = 0; i < hex.length; i += 2) {
                        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
                    }
                    return str;
                };

                const key = hexToString(m_var.r);
                const selected_s = s_var[index];
                const selected_a = a_var[index];
                const p_map = [p_vars.p0, p_vars.p1, p_vars.p2, p_vars.p3, p_vars.p4, p_vars.p5, p_vars.p6, p_vars.p7, p_vars.p8];

                let link = '';
                for (let i = 0; i < selected_s.length; i += 2) {
                    const partIndex = parseInt(selected_s.substring(i, i + 2), 16) - 1;
                    link += p_map[partIndex].join('');
                }
                link += selected_a.t;

                let decoded = '';
                for (let i = 0; i < link.length; i += 2) {
                    const hexVal = parseInt(link.substr(i, 2), 16);
                    const keyChar = key.charCodeAt(i / 2 % key.length);
                    decoded += String.fromCharCode(hexVal ^ keyChar);
                }
                return decoded;
            } catch (e) {
                console.error(`Decryption failed for server index ${index}: ${e.message}`);
                return null;
            }
        };

        const extractorMap = [
            { key: 'dood',       func: this._doodstreamExtractor },
            { key: 'streamwish', func: this._streamwishExtractor },
            { key: 'videa',      func: this._videaExtractor },
        ];

        for (const element of doc.select('#episode-servers li a')) {
            try {
                const serverId = parseInt(element.attr('data-server-id'));
                if (isNaN(serverId)) continue;

                const streamUrl = decryptUrl(serverId);
                if (!streamUrl) continue;

                const fullText = element.text.trim();
                const parts = fullText.split(' - ');
                const serverName = parts[0].trim().toLowerCase();
                const qualityText = parts.length > 1 ? parts[1].trim() : "HD";

                let qualityPrefix = `${serverName.charAt(0).toUpperCase() + serverName.slice(1)} - ${qualityText}`;
                if (showEmbedUrl) {
                    qualityPrefix += ` [${streamUrl}]`;
                }

                const extractor = extractorMap.find(ext => serverName.includes(ext.key));
                if (extractor) {
                    const extractedVideos = await extractor.func.call(this, streamUrl, qualityPrefix);
                    if (extractedVideos && extractedVideos.length > 0) {
                        videos.push(...extractedVideos);
                    }
                }
            } catch (e) {
                console.error(`Failed to process server: ${element.text.trim()}`, e.message);
            }
        }

        return videos;
    }

    // --- EXTRACTORS ---

    async _parseM3U8(playlistUrl, prefix, headers = {}) {
        const videos = [];
        try {
            const playlistContent = (await this.client.get(playlistUrl, headers)).body;
            const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
            const lines = playlistContent.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    const resolution = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1];
                    const quality = resolution ? resolution.split('x')[1] + "p" : "Default";
                    let videoUrl = lines[++i];
                    if (videoUrl && !videoUrl.startsWith('http')) videoUrl = baseUrl + videoUrl;
                    if (videoUrl) videos.push({
                        url: videoUrl,
                        quality: `${prefix} ${quality}`,
                        headers
                    });
                }
            }
        } catch (e) {
            console.error(`Failed to parse M3U8 playlist: ${e.message}`);
        }
        videos.push({
            url: playlistUrl,
            quality: `${prefix} Auto (HLS)`,
            headers
        });
        return videos;
    }

    async _streamwishExtractor(url, prefix) {
        const res = await this.client.get(url, this.getHeaders(url));
        let script = res.body.substringAfter("eval(function(p,a,c,k,e,d)").substringBefore("</script>");
        if (!script) return [];

        script = "eval(function(p,a,c,k,e,d)" + script;
        const unpacked = unpackJs(script);

        const masterUrl = unpacked.match(/(https?:\/\/[^"]+\.m3u8[^"]*)/)?.[1];
        if (!masterUrl) return [];

        return this._parseM3U8(masterUrl, prefix, this.getHeaders(url));
    }

    async _doodstreamExtractor(url, quality) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const doodDataUrl = res.body.substringAfter("$.get('").substringBefore("', function");
            if (!doodDataUrl) return [];

            const pass_md5 = doodDataUrl.substringAfter("pass_md5/");
            const token = pass_md5.substringAfter(doodDataUrl.split("/").pop() + "/");
            const doodHeaders = { "Referer": url };
            const videoData = (await this.client.get(`https://dood.yt${doodDataUrl}`, doodHeaders)).body;
            const videoUrl = videoData + "z" + token + Date.now();
            return [{ url: videoUrl, quality: quality, headers: doodHeaders }];
        } catch (e) {
            return [];
        }
    }

    async _videaExtractor(url, quality) {
        try {
            const res = await this.client.get(url, this.getHeaders(url));
            const videoUrl = res.body.substringAfter("v.player.source(").substringBefore(");").match(/'(https?:\/\/[^']+)'/)?.[1];
            return videoUrl ? [{ url: videoUrl, quality: quality, headers: this.getHeaders(url) }] : [];
        } catch (e) {
            return [];
        }
    }
}


