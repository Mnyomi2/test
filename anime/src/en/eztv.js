const mangayomiSources = [{
    "name": "EZTV",
    "id": 987654321,
    "lang": "en",
    "baseUrl": "https://eztvx.to",
    "iconUrl": "https://eztvx.to/favicon.ico",
    "typeSource": "single",
    "itemType": 1,
    "version": "1.0.0",
    "pkgPath": "anime/src/en/eztv.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.apiBaseUrl = "https://eztvx.to/api";
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }

    // Helper to format bytes into a human-readable string
    bytesToSize(bytes) {
        if (bytes === 0) return '0 B';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return `${Math.round(bytes / Math.pow(1024, i), 2)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`;
    }

    // Helper to parse the torrent list and group them by show
    _parseShowList(resBody) {
        const data = JSON.parse(resBody);
        if (!data || !data.torrents) {
            return { list: [], hasNextPage: false };
        }

        // Use a Map to group episodes by their show's IMDB ID
        const shows = new Map();
        for (const torrent of data.torrents) {
            // Skip entries without an IMDB ID
            if (!torrent.imdb_id || torrent.imdb_id === "0") continue;

            // If we haven't seen this show yet, add it to the map
            if (!shows.has(torrent.imdb_id)) {
                // Try to extract a clean show name from the filename
                const showNameMatch = torrent.title.match(/^(.*?)\sS\d{2}E\d{2}/);
                const showName = showNameMatch ? showNameMatch[1].replace(/\./g, ' ') : torrent.title;

                shows.set(torrent.imdb_id, {
                    name: showName,
                    // Create a custom link format for the getDetail function
                    link: `${this.source.baseUrl}/show/imdb/${torrent.imdb_id}`,
                    // Use screenshot as cover, prepend protocol if missing
                    imageUrl: torrent.large_screenshot ? `https:${torrent.large_screenshot}` : ""
                });
            }
        }

        const list = Array.from(shows.values());
        const hasNextPage = (data.torrents_count || 0) > ((data.page || 1) * (data.limit || 50));
        return { list, hasNextPage };
    }

    async getPopular(page) {
        const limit = this.getPreference("eztv_results_limit") || 50;
        const url = `${this.apiBaseUrl}/get-torrents?limit=${limit}&page=${page}`;
        const res = await this.client.get(url);
        return this._parseShowList(res.body);
    }

    async getLatestUpdates(page) {
        // EZTV API doesn't have a separate "popular" sort, so this will be the same as latest.
        return this.getPopular(page);
    }

    async search(query, page, filters) {
        // The API only supports search by IMDB ID. We will ignore page and filters.
        // It does not support searching by show name.
        const imdbId = query.trim();
        // Basic check to see if it looks like an IMDB ID
        if (!imdbId.match(/^(tt)?\d{7,8}$/)) {
            return { list: [], hasNextPage: false }; // Return empty if not an IMDB ID
        }
        
        if (page > 1) return { list: [], hasNextPage: false }; // Search results are not paginated

        const url = `${this.apiBaseUrl}/get-torrents?imdb_id=${imdbId.replace('tt','')}`;
        const res = await this.client.get(url);
        return this._parseShowList(res.body);
    }

    async getDetail(url) {
        const imdbId = url.split("/imdb/").pop();
        const apiUrl = `${this.apiBaseUrl}/get-torrents?imdb_id=${imdbId}`;
        const res = await this.client.get(apiUrl);
        const data = JSON.parse(res.body);
        
        if (!data || !data.torrents || data.torrents.length === 0) {
            throw new Error("No torrents found for this show.");
        }

        // Sort torrents by Season and Episode, descending (newest first)
        data.torrents.sort((a, b) => {
            const seasonComp = parseInt(b.season) - parseInt(a.season);
            if (seasonComp !== 0) return seasonComp;
            return parseInt(b.episode) - parseInt(a.episode);
        });

        const firstTorrent = data.torrents[0];
        const showNameMatch = firstTorrent.title.match(/^(.*?)\sS\d{2}E\d{2}/);
        const showName = showNameMatch ? showNameMatch[1].replace(/\./g, ' ') : firstTorrent.title;

        // Create chapter list from sorted torrents
        const chapters = data.torrents.map(torrent => ({
            name: torrent.title,
            // Pass both links to getVideoList, separated by a unique separator
            url: `${torrent.torrent_url}||${torrent.magnet_url}||${torrent.filename}`
        }));

        return {
            name: showName,
            imageUrl: firstTorrent.large_screenshot ? `https:${firstTorrent.large_screenshot}` : "",
            description: `All available episodes for ${showName}. Total torrents: ${data.torrents_count}.`,
            link: url,
            chapters: chapters,
            status: 1 // Ongoing
        };
    }

    async getVideoList(url) {
        // Unpack the URLs and filename from the chapter URL
        const [torrentUrl, magnetUrl, filename] = url.split("||");
        const linkType = this.getPreference("eztv_link_type") || "torrent";
        const videoList = [];

        // Add .torrent File Link if requested (for internal player)
        if (linkType === 'torrent' || linkType === 'both') {
            videoList.push({
                url: torrentUrl,
                originalUrl: torrentUrl,
                quality: `[.torrent] ${filename}`,
            });
        }

        // Add Magnet Link if requested (for external player)
        if (linkType === 'magnet' || linkType === 'both') {
            videoList.push({
                url: magnetUrl,
                originalUrl: magnetUrl,
                quality: `[Magnet] ${filename}`,
            });
        }

        return videoList;
    }

    // EZTV API has no filters for browsing.
    getFilterList() {
        return [];
    }
    
    getSourcePreferences() {
        return [
            {
                key: "eztv_link_type",
                listPreference: {
                    title: "Video Link Type",
                    summary: "'.torrent' is required for the internal player. 'Magnet' requires an external torrent app.",
                    valueIndex: 0,
                    entries: [".torrent File (for Internal Player)", "Magnet Link (for External Player)", "Show Both"],
                    entryValues: ["torrent", "magnet", "both"]
                }
            },
            {
                key: "eztv_results_limit",
                editTextPreference: {
                    title: "Results Limit Per Page",
                    summary: "Number of torrents to load per page (1-100). Higher values may group more shows per page.",
                    value: "50",
                    dialogTitle: "Set limit",
                    dialogMessage: "Enter a number between 1 and 100."
                }
            }
        ];
    }
}