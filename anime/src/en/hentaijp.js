const mangayomiSources = [{
    "name": "Hentai JP",
    "id": 8172938104,
    "lang": "en",
    "baseUrl": "https://hentai.jp",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentai.jp",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": true,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/hentaijp.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders(referer) {
        const baseUrl = this.source.baseUrl;
        return {
            "Referer": referer || baseUrl,
            "Origin": baseUrl
        };
    }

    // A helper function to parse anime list pages (popular, latest, search)
    async _getAnimePage(url) {
        const res = await this.client.get(url, this.getHeaders());
        const doc = new Document(res.body);
        const baseUrl = this.source.baseUrl;

        const seriesMap = new Map();
        doc.select("article.thumb-block").forEach(el => {
            const a = el.selectFirst("a");
            if (!a) return;

            const fullName = a.attr("title");
            const imageUrl = el.selectFirst("img")?.attr("data-src") || el.selectFirst("img")?.getSrc;

            // Extract the series name by removing episode numbers and other suffixes
            const seriesNameMatch = fullName.match(/^(.*?)(?: Episode \d+)?/i);
            const seriesName = seriesNameMatch ? seriesNameMatch[1].trim() : fullName.trim();

            // Create a unique entry for each series to avoid duplicates on the list page
            if (!seriesMap.has(seriesName) && seriesName) {
                // We create a "virtual" link to pass the series name to getDetail
                const seriesLink = `/series/${encodeURIComponent(seriesName)}`;
                seriesMap.set(seriesName, {
                    name: seriesName,
                    imageUrl: imageUrl,
                    link: seriesLink,
                });
            }
        });

        const list = Array.from(seriesMap.values());
        const hasNextPage = !!doc.selectFirst("li a:contains(Next)");

        return { list, hasNextPage };
    }


    async getPopular(page) {
        const url = page === 1 ?
            `${this.source.baseUrl}/category/engsub/?filter=latest` :
            `${this.source.baseUrl}/category/engsub/page/${page}/?filter=latest`;
        return this._getAnimePage(url);
    }

    async getLatestUpdates(page) {
        const url = page === 1 ?
            `${this.source.baseUrl}/category/new-releases/?filter=latest` :
            `${this.source.baseUrl}/category/new-releases/page/${page}/?filter=latest`;
        return this._getAnimePage(url);
    }

    async search(query, page) {
        const url = `${this.source.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}`;
        return this._getAnimePage(url);
    }

    async getDetail(url) {
        // The URL is a "virtual" link like "/series/SERIES_NAME"
        if (!url.startsWith('/series/')) {
            throw new Error('Invalid series URL');
        }

        const seriesName = decodeURIComponent(url.replace('/series/', ''));
        const baseUrl = this.source.baseUrl;
        const searchUrl = `${baseUrl}/?s=${encodeURIComponent(seriesName)}`;

        const res = await this.client.get(searchUrl, this.getHeaders());
        const doc = new Document(res.body);

        const chapters = [];
        let firstEpisodeUrl = null;
        let imageUrl = null;

        // Find all episodes related to the series from the search results
        doc.select("article.thumb-block").forEach(el => {
            const a = el.selectFirst("a");
            if (!a) return;
            const episodeName = a.attr("title");

            // Ensure it's part of the same series by checking the title
            if (episodeName.toLowerCase().startsWith(seriesName.toLowerCase())) {
                const episodeUrl = a.getHref.replace(baseUrl, "");
                chapters.push({ name: episodeName, url: episodeUrl });
                if (!firstEpisodeUrl) {
                    firstEpisodeUrl = episodeUrl;
                    imageUrl = el.selectFirst("img")?.attr("data-src") || el.selectFirst("img")?.getSrc;
                }
            }
        });

        if (chapters.length === 0) {
            throw new Error(`No episodes found for "${seriesName}".`);
        }

        // Fetch the first episode page to get genres
        let genre = [];
        if (firstEpisodeUrl) {
            try {
                const firstEpRes = await this.client.get(baseUrl + firstEpisodeUrl, this.getHeaders());
                const firstEpDoc = new Document(firstEpRes.body);
                genre = firstEpDoc.select("div.video-tags a.label").map(g => g.text.trim());
            } catch (e) {
                // Ignore if fetching first episode fails
                console.error(`Failed to fetch genres from ${firstEpisodeUrl}: ${e.message}`);
            }
        }

        // Custom sort based on "Episode XX" in the title
        chapters.sort((a, b) => {
            const numA = parseInt(a.name.match(/Episode (\d+)/i)?.[1] || 0);
            const numB = parseInt(b.name.match(/Episode (\d+)/i)?.[1] || 0);
            return numA - numB;
        });

        return {
            name: seriesName,
            imageUrl,
            genre,
            status: 1, // Ongoing
            chapters: chapters,
            link: url, // Return the virtual link
        };
    }

    async getVideoList(url) {
        const baseUrl = this.source.baseUrl;
        const episodePageUrl = baseUrl + url;
        const res = await this.client.get(episodePageUrl, this.getHeaders(episodePageUrl));
        const body = res.body;

        let sources = [];
        let subtitles = [];

        // Method 1: Look for sources directly embedded in jwpConfig
        let sourcesMatch = body.match(/sources:\s*(\[[\s\S]*?\])/);
        if (sourcesMatch && sourcesMatch[1] && sourcesMatch[1].includes('"file"')) {
            try {
                // Use regex to parse JS object string, as it's not valid JSON
                const sourceItems = sourcesMatch[1].match(/\{[\s\S]*?\}/g) || [];
                sourceItems.forEach(item => {
                    const fileMatch = item.match(/file"\s*:\s*"(.*?)"/);
                    const labelMatch = item.match(/label"\s*:\s*"(.*?)"/);
                    if (fileMatch && labelMatch) {
                        sources.push({
                            url: "https:" + fileMatch[1].replace(/\\/g, ''),
                            quality: labelMatch[1],
                            originalUrl: "https:" + fileMatch[1].replace(/\\/g, ''),
                        });
                    }
                });
            } catch (e) {
                console.error("Failed to parse direct sources from jwpConfig");
            }
        }

        // Method 2: If no sources found, look for API URL in the script
        if (sources.length === 0) {
            const apiUrlMatch = body.match(/url:\s*"(\/\/doodst\.com\/api\/[^"]+)"/);
            if (apiUrlMatch && apiUrlMatch[1]) {
                const apiUrl = "https:" + apiUrlMatch[1];
                try {
                    const apiRes = await this.client.get(apiUrl, this.getHeaders(episodePageUrl));
                    const apiData = JSON.parse(apiRes.body);
                    if (apiData.status === "ok" && apiData.sources) {
                        apiData.sources.forEach(source => {
                            sources.push({
                                url: "https:" + source.file,
                                quality: source.label,
                                originalUrl: "https:" + source.file,
                            });
                        });
                        if (apiData.tracks) {
                            apiData.tracks.forEach(track => {
                                subtitles.push({ file: track.file, label: track.label });
                            });
                        }
                    }
                } catch (e) {
                    console.error(`API call to ${apiUrl} failed: ${e.message}`);
                }
            }
        }

        // Get subtitles from jwpConfig if not already retrieved from API
        if (subtitles.length === 0) {
            let tracksMatch = body.match(/tracks:\s*(\[[\s\S]*?\])/);
            if (tracksMatch && tracksMatch[1]) {
                try {
                    const trackItems = tracksMatch[1].match(/\{[\s\S]*?\}/g) || [];
                    trackItems.forEach(item => {
                        const fileMatch = item.match(/file"\s*:\s*"(.*?)"/);
                        const labelMatch = item.match(/label"\s*:\s*"(.*?)"/);
                        if (fileMatch && labelMatch) {
                            subtitles.push({
                                file: fileMatch[1].replace(/\\/g, ''),
                                label: labelMatch[1]
                            });
                        }
                    });
                } catch (e) {
                    console.error("Failed to parse subtitles from jwpConfig");
                }
            }
        }

        // Method 3 (Fallback): Extract iframe embed URLs from server buttons
        if (sources.length === 0) {
            const doc = new Document(body);
            const serverButtons = doc.select("div.list-server button");
            for (const button of serverButtons) {
                const embedHtml = button.attr("data-embed");
                const srcMatch = embedHtml.match(/src="([^"]+)"/);
                if (srcMatch && srcMatch[1]) {
                    let embedUrl = srcMatch[1];
                    if (embedUrl.startsWith("//")) {
                        embedUrl = "https:" + embedUrl;
                    }
                    sources.push({
                        url: embedUrl,
                        quality: button.text.trim(),
                        originalUrl: embedUrl,
                    });
                }
            }
        }

        if (sources.length === 0) {
            throw new Error("No video sources found.");
        }

        // Add subtitles to all video sources found and sort by quality
        const sortedSources = sources.map(s => ({ ...s, subtitles }));
        sortedSources.sort((a, b) => {
            const qualityA = parseInt(a.quality);
            const qualityB = parseInt(b.quality);
            if (!isNaN(qualityA) && !isNaN(qualityB)) {
                return qualityB - qualityA;
            }
            return 0; // Keep original order for non-numeric qualities
        });

        return sortedSources;
    }
}
