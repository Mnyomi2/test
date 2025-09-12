const mangayomiSources = [{
    "name": "HentaiHaven",
    "id": 1696954203651,
    "lang": "en",
    "baseUrl": "https://hentaihaven.co",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=hentaihaven.co",
    "typeSource": "single",
    "isNsfw": true,
    "itemType": 1,
    "version": "1.0.6",
    "pkgPath": "anime/src/en/hentaihaven.js"
}];


class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    get supportsLatest() {
        return this.getPreference("enable_latest_tab");
    }

    getPreference(key) {
        return new SharedPreferences().get(key);
    }
    
    getBaseUrl() {
        return this.getPreference("override_base_url") || this.source.baseUrl;
    }

    getHeaders(url) {
        return {
            "Referer": this.getBaseUrl(),
            "Origin": this.getBaseUrl(),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        };
    }

    async getPopular(page) {
        const url = `${this.getBaseUrl()}/search/?match=all&sort=views_desc&page=${page}`;
        return this.parseDirectory(url);
    }
    
    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/search/?match=all&sort=recent&page=${page}`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        let url = `${this.getBaseUrl()}/search/?`;
        const params = [];
        let hasActiveFilters = false;

        params.push(`page=${page}`);
        params.push("match=all");

        let finalQuery = query || "";
        const includeKeywordsFilter = filters.find(f => f.name === "Include Keywords");
        if (includeKeywordsFilter) {
            const selectedKeywords = includeKeywordsFilter.state
                .filter(k => k.state)
                .map(k => k.value);
            if (selectedKeywords.length > 0) {
                const keywordQuery = selectedKeywords.join(" ");
                if (finalQuery) {
                    finalQuery += " " + keywordQuery;
                } else {
                    finalQuery = keywordQuery;
                }
            }
        }

        if (finalQuery) {
            params.push(`q=${encodeURIComponent(finalQuery.trim())}`);
        }
        
        const brandFilter = filters.find(f => f.name === "Brand");
        if (brandFilter && brandFilter.state > 0) {
            params.push(`brand=${brandFilter.values[brandFilter.state].value}`);
            hasActiveFilters = true;
        }

        const yearFilter = filters.find(f => f.name === "Year");
        if (yearFilter && yearFilter.state > 0) {
            params.push(`year=${yearFilter.values[yearFilter.state].value}`);
            hasActiveFilters = true;
        }

        const includeGenresFilter = filters.find(f => f.name === "Include Genres");
        if (includeGenresFilter) {
            const included = includeGenresFilter.state
                .filter(g => g.state)
                .map(g => g.value);
            if (included.length > 0) {
                params.push(`genre=${included.join(',')}`);
                hasActiveFilters = true;
            }
        }

        const excludeGenresFilter = filters.find(f => f.name === "Exclude Genres");
        if (excludeGenresFilter) {
            const excluded = excludeGenresFilter.state
                .filter(g => g.state)
                .map(g => g.value);
            if (excluded.length > 0) {
                params.push(`exclude_genre=${excluded.join(',')}`);
                hasActiveFilters = true;
            }
        }

        const sortFilter = filters.find(f => f.name === "Sort by");
        const sortValue = sortFilter ? sortFilter.values[sortFilter.state].value : null;

        if (sortValue) {
            params.push(`sort=${sortValue}`);
        } else if (!finalQuery && hasActiveFilters) {
            params.push("sort=recent");
        }
        
        url += params.join("&");
        return this.parseDirectory(url);
    }

    async parseDirectory(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const list = [];
        const items = doc.select("a.a_item");

        for (const item of items) {
            const name = item.selectFirst("div.video_title").text;
            const link = this.getBaseUrl() + item.getHref;
            const imgElement = item.selectFirst("img");
            const imageUrl = this.getBaseUrl() + (imgElement.attr("data-src") || imgElement.getSrc);
            list.push({ name, imageUrl, link });
        }
        
        const hasNextPage = doc.selectFirst("li.page-item:not(.disabled) a.page-link:contains(Next)") != null;
        return { list, hasNextPage };
    }

    async getDetail(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const seriesName = doc.selectFirst("span:contains(Series) + span.sub_r a")?.text;
        const name = seriesName ?? doc.selectFirst("h1.video_title").text;
        const imgElement = doc.selectFirst("div.cover img");
        const imageUrl = this.getBaseUrl() + (imgElement.attr("data-src") || imgElement.getSrc);
        const originalDescription = doc.selectFirst("div.video_description p")?.text?.trim() ?? "";
        
        const details = [];
        const brand = doc.selectFirst("span:contains(Brand) + span.sub_r")?.text;
        if (brand) details.push(`Brand: ${brand}`);
        const releaseDate = doc.selectFirst("span:contains(Release Date) + span.sub_r")?.text;
        if (releaseDate) details.push(`Release Date: ${releaseDate}`);
        const uploadDate = doc.selectFirst("span:contains(Upload Date) + span.sub_r")?.text;
        if (uploadDate) details.push(`Upload Date: ${uploadDate}`);
        const views = doc.selectFirst("span:contains(Views) + span.sub_r")?.text;
        if (views) details.push(`Views: ${views}`);
        const altTitles = doc.selectFirst("div.r_item.full span.sub_t")?.text;
        if (altTitles) details.push(`Alternate Titles: ${altTitles}`);

        let description = "";
        if (details.length > 0) description += details.join("\n") + "\n\n";
        description += originalDescription;

        const link = url;
        const status = 1;
        const genre = [];
        const genreElements = doc.select("div.video_tags > a[href*='/genre/']");
        for (const element of genreElements) genre.push(element.text);

        const chapters = [];
        const episodeElements = doc.select("div.mfs_item");
        if (episodeElements.length > 0) {
            for (const element of episodeElements) {
                const epName = element.selectFirst("div.infos .title a").text;
                const epUrl = this.getBaseUrl() + element.selectFirst("div.infos .title a").getHref;
                chapters.push({ name: epName, url: epUrl });
            }
            chapters.reverse();
        } else {
            const epName = doc.selectFirst("h1.video_title").text;
            chapters.push({ name: epName, url: url });
        }

        return { name, imageUrl, description, link, status, genre, chapters };
    }

    async getVideoList(url) {
        const res = await this.client.get(url, this.getHeaders(url));
        const doc = new Document(res.body);
        const iframeSrc1 = doc.selectFirst("div.player iframe")?.getSrc;
        if (!iframeSrc1) return [];

        const res1 = await this.client.get(iframeSrc1, this.getHeaders(url));
        const doc1 = new Document(res1.body);
        const playerDataId = doc1.selectFirst("li[data-id]")?.attr("data-id");
        if (!playerDataId) return [];

        const playerUrl = "https://nhplayer.com" + playerDataId;
        const playerRes = await this.client.get(playerUrl, this.getHeaders(iframeSrc1));
        const scriptContent = playerRes.body;
        const streamUrlMatch = scriptContent.match(/file:\s*['"](.*?)['"]/);
        if (!streamUrlMatch || !streamUrlMatch[1]) return [];
        
        const masterPlaylistUrl = streamUrlMatch[1];
        const streams = [];

        if (this.getPreference("iptv_extract_qualities") && masterPlaylistUrl.toLowerCase().includes('.m3u8')) {
            try {
                const masterPlaylistContent = (await this.client.get(masterPlaylistUrl, this.getHeaders(masterPlaylistUrl))).body;
                const regex = /#EXT-X-STREAM-INF:.*(?:RESOLUTION=(\d+x\d+)|BANDWIDTH=(\d+)).*\n(?!#)(.+)/g;
                let match;
                const parsedQualities = [];
                const baseUrl = masterPlaylistUrl.substring(0, masterPlaylistUrl.lastIndexOf('/') + 1);
                while ((match = regex.exec(masterPlaylistContent)) !== null) {
                    const resolution = match[1];
                    const bandwidth = match[2];
                    let qualityName = resolution ? `${resolution.split('x')[1]}p` : `${Math.round(parseInt(bandwidth) / 1000)}kbps`;
                    let streamUrl = match[3].trim();
                    if (!streamUrl.startsWith('http')) streamUrl = baseUrl + streamUrl;
                    parsedQualities.push({ url: streamUrl, originalUrl: streamUrl, quality: qualityName, headers: this.getHeaders(streamUrl) });
                }
                if (parsedQualities.length > 0) {
                    streams.push({ url: masterPlaylistUrl, originalUrl: masterPlaylistUrl, quality: `Auto (HLS)`, headers: this.getHeaders(masterPlaylistUrl) });
                    parsedQualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
                    streams.push(...parsedQualities);
                    return streams;
                }
            } catch (e) { /* Fall through */ }
        }
        streams.push({ url: masterPlaylistUrl, originalUrl: masterPlaylistUrl, quality: "Default", headers: this.getHeaders(masterPlaylistUrl) });
        return streams;
    }

    getFilterList() {
        const sortOptions = [{ name: "Relevance", value: "" }, { name: "Recent", value: "recent" }, { name: "Oldest", value: "oldest" }, { name: "Most Views", value: "views_desc" }, { name: "Most Likes", value: "likes_desc" }, { name: "Title (A-Z)", value: "title_az" }, { name: "Title (Z-A)", value: "title_za" }];
        const siteGenres = ["3d","ahegao","anal","BDSM","big boobs","blow job","bondage","boob job","censored","comedy","cosplay","creampie","dark skin","facial","fantasy","filmed","foot job","futanari","gangbang","glasses","hand job","harem","HD","horror","incest","inflation","lactation","loli","maid","masturbation","milf","mind break","mind control","monster","nekomimi","ntr","nurse","Oral","orgy","plot","pov","pregnant","public sex","rape","reverse rape","rimjob","scat","school girl","Short","shota","softcore","swimsuit","teacher","tentacle","threesome","toys","trap","tsundere","ugly bastard","uncensored","vanilla","virgin","watersports","x-ray","yaoi","yuri"];
        const keywordList = [{ name: "Action", value: "action" },{ name: "Adult Cast", value: "adult-cast" },{ name: "Adventure", value: "adventure" },{ name: "Anthropomorphic", value: "anthropomorphic" },{ name: "Avant Garde", value: "avant-garde" },{ name: "Award Winning", value: "award-winning" },{ name: "Childcare", value: "childcare" },{ name: "Combat Sports", value: "combat-sports" },{ name: "Comedy", value: "comedy" },{ name: "Cute Girls Doing Cute Things", value: "cgdct" },{ name: "Delinquents", value: "delinquents" },{ name: "Detective", value: "detective" },{ name: "Drama", value: "drama" },{ name: "Ecchi", value: "ecchi" },{ name: "Fantasy", value: "fantasy" },{ name: "Gag Humor", value: "gag-humor" },{ name: "Gore", value: "gore" },{ name: "Gourmet", value: "gourmet" },{ name: "Harem", value: "harem" },{ name: "High Stakes Game", value: "high-stakes-game" },{ name: "Historical", value: "historical" },{ name: "Horror", value: "horror" },{ name: "Idols (Male)", value: "idols-male" },{ name: "Isekai", value: "isekai" },{ name: "Iyashikei", value: "iyashikei" },{ name: "Love Polygon", value: "love-polygon" },{ name: "Magical Sex Shift", value: "magical-sex-shift" },{ name: "Martial Arts", value: "martial-arts" },{ name: "Mecha", value: "mecha" },{ name: "Medical", value: "medical" },{ name: "Military", value: "military" },{ name: "Music", value: "music" },{ name: "Mystery", value: "mystery" },{ name: "Mythology", value: "mythology" },{ name: "Organized Crime", value: "organized-crime" },{ name: "Otaku Culture", value: "otaku-culture" },{ name: "Parody", value: "parody" },{ name: "Performing Arts", value: "performing-arts" },{ name: "Pets", value: "pets" },{ name: "Psychological", value: "psychological" },{ name: "Racing", value: "racing" },{ name: "Reincarnation", value: "reincarnation" },{ name: "Reverse Harem", value: "reverse-harem" },{ name: "Romance", value: "romance" },{ name: "Romantic Subtext", value: "romantic-subtext" },{ name: "Samurai", value: "samurai" },{ name: "School", value: "school" },{ name: "Sci-Fi", value: "sci-fi" },{ name: "Seinen", value: "seinen" },{ name: "Shoujo", value: "shoujo" },{ name: "Shoujo Ai", value: "shoujo-ai" },{ name: "Shounen", value: "shounen" },{ name: "Slice of Life", value: "slice-of-life" },{ name: "Space", value: "space" },{ name: "Sports", value: "sports" },{ name: "Strategy Game", value: "strategy-game" },{ name: "Super Power", value: "super-power" },{ name: "Supernatural", value: "supernatural" },{ name: "Survival", value: "survival" },{ name: "Suspense", value: "suspense" },{ name: "Team Sports", value: "team-sports" },{ name: "Time Travel", value: "time-travel" },{ name: "Vampire", value: "vampire" },{ name: "Video Game", value: "video-game" },{ name: "Visual Arts", value: "visual-arts" },{ name: "Workplace", value: "workplace" }];
        const brands = [{name:"@ OZ",value:"oz"},{name:"37c-Binetsu",value:"37c-binetsu"},{name:"Adult Source Media",value:"obtain-future"},{name:"Ajia-Do",value:"ajia-do"},{name:"Almond Collective",value:"almond-collective"},{name:"Alpha Polis",value:"alpha-polis"},{name:"Ameliatie",value:"ameliatie"},{name:"Amour",value:"amour"},{name:"Animac",value:"animac"},{name:"Anime Antenna Iinkai",value:"anime-antenna-iinkai"},{name:"Antechinus",value:"antechinus"},{name:"APPP",value:"appp"},{name:"Arms",value:"arms"},{name:"Bishop",value:"bishop"},{name:"Blue Eyes",value:"blue-eyes"},{name:"BOMB! CUTE! BOMB!",value:"bomb-cute-bomb"},{name:"Bootleg",value:"bootleg"},{name:"BreakBottle",value:"breakbottle"},{name:"BugBug",value:"bugbug"},{name:"Bunnywalker",value:"bunnywalker"},{name:"Celeb",value:"celeb"},{name:"Central Park Media",value:"central-park-media"},{name:"ChiChinoya",value:"chichinoya"},{name:"Chocolat",value:"chocolat"},{name:"ChuChu",value:"chuchu"},{name:"Circle Tribute",value:"circle-tribute"},{name:"CoCoans",value:"cocoans"},{name:"Collaboration Works",value:"collaboration-works"},{name:"Comet",value:"comet"},{name:"Comic Media",value:"comic-media"},{name:"Cosmos",value:"cosmos"},{name:"Cranberry",value:"cranberry"},{name:"Crimson",value:"crimson"},{name:"D3",value:"d3"},{name:"Daiei",value:"daiei"},{name:"demodemon",value:"demodemon"},{name:"Digital Works",value:"digital-works"},{name:"Discovery",value:"discovery"},{name:"Dollhouse",value:"dollhouse"},{name:"EBIMARU-DO",value:"ebimaru-do"},{name:"Echo",value:"echo"},{name:"ECOLONUN",value:"ecolonun"},{name:"Edge",value:"edge"},{name:"Erozuki",value:"erozuki"},{name:"evee",value:"evee"},{name:"FINAL FUCK 7",value:"final-fuck-7"},{name:"Five Ways",value:"five-ways"},{name:"Friends Media Station",value:"friends-media-station"},{name:"Front Line",value:"front-line"},{name:"fruit",value:"fruit"},{name:"Godoy",value:"godoy"},{name:"GodoyG",value:"godoyg"},{name:"GOLD BEAR",value:"gold-bear"},{name:"gomasioken",value:"gomasioken"},{name:"Green Bunny",value:"green-bunny"},{name:"Groover",value:"groover"},{name:"Hokiboshi",value:"hokiboshi"},{name:"Hoods Entertainment",value:"hoods-entertainment"},{name:"Hot Bear",value:"hot-bear"},{name:"Hykobo",value:"hykobo"},{name:"IRONBELL",value:"ironbell"},{name:"ITONAMI",value:"itonami"},{name:"Ivory Tower",value:"ivory-tower"},{name:"J.C.",value:"j-c"},{name:"Jellyfish",value:"jellyfish"},{name:"Jewel",value:"jewel"},{name:"Jumondo",value:"jumondo"},{name:"kate_sai",value:"kate_sai"},{name:"KENZsoft",value:"kenzsoft"},{name:"King Bee",value:"king-bee"},{name:"Kitty Media",value:"kitty-media"},{name:"Knack",value:"knack"},{name:"Kuril",value:"kuril"},{name:"L.",value:"l"},{name:"Lemon Heart",value:"lemon-heart"},{name:"Lilix",value:"lilix"},{name:"Lune Pictures",value:"lune-pictures"},{name:"Magic Bus",value:"magic-bus"},{name:"Magin Label",value:"magin-label"},{name:"Majin Petit",value:"majin-petit"},{name:"Marigold",value:"marigold"},{name:"Mary Jane",value:"mary-jane"},{name:"Media Blasters",value:"media-blasters"},{name:"MediaBank",value:"mediabank"},{name:"Metro Notes",value:"metro-notes"},{name:"Milky",value:"milky"},{name:"MiMiA Cute",value:"mimia-cute"},{name:"Moon Rock",value:"moon-rock"},{name:"Moonstone Cherry",value:"moonstone-cherry"},{name:"Mousou Senka",value:"mousou-senka"},{name:"MS Pictures",value:"ms-pictures"},{name:"Muse",value:"muse"},{name:"N43",value:"n43"},{name:"New generation",value:"new-generation"},{name:"Nihikime no Dozeu",value:"nihikime-no-dozeu"},{name:"Nikkatsu Video",value:"nikkatsu-video"},{name:"nur",value:"nur"},{name:"NuTech Digital",value:"nutech-digital"},{name:"Otodeli",value:"otodeli"},{name:"Pashmina",value:"pashmina"},{name:"Passione",value:"passione"},{name:"Peach Pie",value:"peach-pie"},{name:"Pink Pineapple",value:"pink-pineapple"},{name:"Pinkbell",value:"pinkbell"},{name:"Pix",value:"pix"},{name:"Pixy Soft",value:"pixy-soft"},{name:"Pocomo Premium",value:"pocomo-premium"},{name:"PoRO",value:"poro"},{name:"Project No.9",value:"project-no-9"},{name:"Pumpkin Pie",value:"pumpkin-pie"},{name:"Queen Bee",value:"queen-bee"},{name:"Rabbit Gate",value:"rabbit-gate"},{name:"ROJIURA JACK",value:"rojiura-jack"},{name:"sakamotoJ",value:"sakamotoj"},{name:"Sakura Purin",value:"sakura-purin"},{name:"SANDWICHWORKS",value:"sandwichworks"},{name:"Schoolzone",value:"schoolzone"},{name:"seismic",value:"seismic"},{name:"SELFISH",value:"selfish"},{name:"Seven",value:"seven"},{name:"Shadow Prod. Co.",value:"shadow-prod-co"},{name:"Shelf",value:"shelf"},{name:"Shinyusha",value:"shinyusha"},{name:"ShoSai",value:"shosai"},{name:"Showten",value:"showten"},{name:"Soft on Demand",value:"soft-on-demand"},{name:"SoftCell",value:"softcell"},{name:"SPEED",value:"speed"},{name:"STARGATE3D",value:"stargate3d"},{name:"Studio 9 Maiami",value:"studio-9-maiami"},{name:"Studio Akai Shohosen",value:"studio-akai-shohosen"},{name:"Studio Deen",value:"studio-deen"},{name:"Studio Fantasia",value:"studio-fantasia"},{name:"Studio FOW",value:"studio-fow"},{name:"studio GGB",value:"studio-ggb"},{name:"Studio Gokumi",value:"studio-gokumi"},{name:"Studio Houkiboshi",value:"studio-houkiboshi"},{name:"Studio Zealot",value:"studio-zealot"},{name:"Suiseisha",value:"suiseisha"},{name:"Suzuki Mirano",value:"suzuki-mirano"},{name:"SYLD",value:"syld"},{name:"t japan",value:"t-japan"},{name:"T-Rex",value:"t-rex"},{name:"TDK Core",value:"tdk-core"},{name:"TNK",value:"tnk"},{name:"TOHO",value:"toho"},{name:"Toranoana",value:"toranoana"},{name:"Torudaya",value:"torudaya"},{name:"Triangle",value:"triangle"},{name:"Trimax",value:"trimax"},{name:"TYS Work",value:"tys-work"},{name:"U-Jin",value:"u-jin"},{name:"Umemaro-3D",value:"umemaro-3d"},{name:"Union Cho",value:"union-cho"},{name:"Valkyria",value:"valkyria"},{name:"Vanilla",value:"vanilla"},{name:"White Bear",value:"white-bear"},{name:"X City",value:"x-city"},{name:"XTER",value:"xter"},{name:"Y.O.U.C.",value:"y-o-u-c"},{name:"yosino",value:"yosino"},{name:"ZIZ",value:"ziz"}];
        const years = ["2025","2024","2023","2022","2021","2020","2019","2018","2017","2016","2015","2014","2013","2012","2011","2010","2009","2008","2007","2006","2005","2004","2003","2002","2001","2000","1999","1998","1997","1996","1995","1994","1993","1992","1991","1990","1989","1988","1987","1986","1985","1984"];

        // Helper function for creating CheckBox objects, as seen in the Hanime example
        const c = (name, value) => ({ type_name: "CheckBox", name, value });

        const toUrlValue = (str) => str.toLowerCase().replace(/\s+/g, '-');
        const toDisplayName = (str) => str.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        const brandOptions = [{ type_name: "SelectOption", name: "Any", value: "" }, ...brands.map(b => ({ type_name: "SelectOption", name: b.name, value: b.value }))];
        const yearOptions = [{ type_name: "SelectOption", name: "Any", value: "" }, ...years.map(y => ({ type_name: "SelectOption", name: y, value: y }))];
        
        const genreCheckFilters = siteGenres.map(g => c(toDisplayName(g), toUrlValue(g)));
        const keywordCheckFilters = keywordList.map(k => c(k.name, k.name));

        return [
            { type_name: "SelectFilter", name: "Sort by", state: 0, values: sortOptions.map(s => ({ type_name: "SelectOption", name: s.name, value: s.value })) },
            { type_name: "SelectFilter", name: "Brand", state: 0, values: brandOptions },
            { type_name: "SelectFilter", name: "Year", state: 0, values: yearOptions },
            { type_name: "GroupFilter", name: "Include Keywords", state: keywordCheckFilters },
            { type_name: "GroupFilter", name: "Include Genres", state: genreCheckFilters },
            { type_name: "GroupFilter", name: "Exclude Genres", state: JSON.parse(JSON.stringify(genreCheckFilters)) },
        ];
    }

    getSourcePreferences() {
        return [
            {
                key: "enable_latest_tab",
                switchPreferenceCompat: {
                    title: "Enable 'Latest' Tab",
                    summary: "Toggles the visibility of the 'Latest' tab for this source.",
                    value: true,
                }
            },
            {
                key: "iptv_extract_qualities",
                switchPreferenceCompat: {
                    title: "Enable Stream Quality Extraction",
                    summary: "If a video provides multiple qualities (HLS/M3U8), this will list them. May not work for all videos.",
                    value: false,
                }
            },
            {
                key: "override_base_url",
                editTextPreference: {
                    title: "Override Base URL",
                    summary: "Use a different mirror/domain for the source",
                    value: this.source.baseUrl,
                    dialogTitle: "Enter new Base URL",
                    dialogMessage: "",
                }
            }
        ];
    }
}
