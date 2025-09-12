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
        const url = `${this.getBaseUrl()}/search/?sort=views_desc&match=all&page=${page}`;
        return this.parseDirectory(url);
    }
    
    async getLatestUpdates(page) {
        const url = `${this.getBaseUrl()}/search/?sort=recent&match=all&page=${page}`;
        return this.parseDirectory(url);
    }

    async search(query, page, filters) {
        const params = {};

        if (query) {
            params.q = query;
        }

        // Process all selected filters.
        for (const filter of filters) {
            if (filter.type_name === 'HeaderFilter') continue;

            if (filter.type_name === 'SelectFilter') {
                const selectedValue = filter.values[filter.state].value;
                if (selectedValue) {
                    params[filter.key] = selectedValue;
                }
            } else if (filter.type_name === 'GroupFilter') {
                const joined = filter.state
                               .filter(box => box.state)
                               .map(box => box.value)
                               .join(',');
                if (joined) {
                    params[filter.key] = joined;
                }
            }
        }
        
        // CRITICAL FIX: Ensure the default parameters `sort` and `match` are always present,
        // as this creates the most stable URL format that works for all cases.
        if (!params.sort) {
            params.sort = 'recent';
        }
        if (!params.match) {
            params.match = 'all';
        }

        params.page = page.toString();

        const queryString = Object.keys(params)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
        
        return this.parseDirectory(`${this.getBaseUrl()}/search/?${queryString}`);
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
        if (details.length > 0) {
            description += details.join("\n") + "\n\n";
        }
        description += originalDescription;

        const link = url;
        const status = 1;

        const genre = [];
        const genreElements = doc.select("div.video_tags > a[href*='/genre/']");
        for (const element of genreElements) {
            genre.push(element.text);
        }

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
                    if (!streamUrl.startsWith('http')) {
                        streamUrl = baseUrl + streamUrl;
                    }

                    parsedQualities.push({
                        url: streamUrl,
                        originalUrl: streamUrl,
                        quality: qualityName,
                        headers: this.getHeaders(streamUrl)
                    });
                }
                
                if (parsedQualities.length > 0) {
                    streams.push({
                        url: masterPlaylistUrl,
                        originalUrl: masterPlaylistUrl,
                        quality: `Auto (HLS)`,
                        headers: this.getHeaders(masterPlaylistUrl)
                    });
                    parsedQualities.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
                    streams.push(...parsedQualities);
                    return streams;
                }
            } catch (e) {
                // Fall through
            }
        }

        streams.push({
            url: masterPlaylistUrl,
            originalUrl: masterPlaylistUrl,
            quality: "Default",
            headers: this.getHeaders(masterPlaylistUrl)
        });

        return streams;
    }

    getFilterList() {
        // Restoring the full, correct filter list
        const sortables = [{name:"Recent Upload",value:"recent"},{name:"Oldest",value:"oldest"},{name:"Most Views",value:"views_desc"},{name:"Most Likes",value:"likes_desc"},{name:"Alphabetical (A-Z)",value:"title_az"},{name:"Alphabetical (Z-A)",value:"title_za"}];
        const genres = ["3d","ahegao","anal","BDSM","big boobs","blow job","bondage","boob job","censored","comedy","cosplay","creampie","dark skin","facial","fantasy","filmed","foot job","futanari","gangbang","glasses","hand job","harem","HD","horror","incest","inflation","lactation","loli","maid","masturbation","milf","mind break","mind control","monster","nekomimi","ntr","nurse","Oral","orgy","plot","pov","pregnant","public sex","rape","reverse rape","rimjob","scat","school girl","Short","shota","softcore","swimsuit","teacher","tentacle","threesome","toys","trap","tsundere","ugly bastard","uncensored","vanilla","virgin","watersports","x-ray","yaoi","yuri"];
        const brands = [{name:"@ OZ",value:"oz"},{name:"37c-Binetsu",value:"37c-binetsu"},{name:"Adult Source Media",value:"obtain-future"},{name:"Ajia-Do",value:"ajia-do"},{name:"Almond Collective",value:"almond-collective"},{name:"Alpha Polis",value:"alpha-polis"},{name:"Ameliatie",value:"ameliatie"},{name:"Amour",value:"amour"},{name:"Animac",value:"animac"},{name:"Anime Antenna Iinkai",value:"anime-antenna-iinkai"},{name:"Antechinus",value:"antechinus"},{name:"APPP",value:"appp"},{name:"Arms",value:"arms"},{name:"Bishop",value:"bishop"},{name:"Blue Eyes",value:"blue-eyes"},{name:"BOMB! CUTE! BOMB!",value:"bomb-cute-bomb"},{name:"Bootleg",value:"bootleg"},{name:"BreakBottle",value:"breakbottle"},{name:"BugBug",value:"bugbug"},{name:"Bunnywalker",value:"bunnywalker"},{name:"Celeb",value:"celeb"},{name:"Central Park Media",value:"central-park-media"},{name:"ChiChinoya",value:"chichinoya"},{name:"Chocolat",value:"chocolat"},{name:"ChuChu",value:"chuchu"},{name:"Circle Tribute",value:"circle-tribute"},{name:"CoCoans",value:"cocoans"},{name:"Collaboration Works",value:"collaboration-works"},{name:"Comet",value:"comet"},{name:"Comic Media",value:"comic-media"},{name:"Cosmos",value:"cosmos"},{name:"Cranberry",value:"cranberry"},{name:"Crimson",value:"crimson"},{name:"D3",value:"d3"},{name:"Daiei",value:"daiei"},{name:"demodemon",value:"demodemon"},{name:"Digital Works",value:"digital-works"},{name:"Discovery",value:"discovery"},{name:"Dollhouse",value:"dollhouse"},{name:"EBIMARU-DO",value:"ebimaru-do"},{name:"Echo",value:"echo"},{name:"ECOLONUN",value:"ecolonun"},{name:"Edge",value:"edge"},{name:"Erozuki",value:"erozuki"},{name:"evee",value:"evee"},{name:"FINAL FUCK 7",value:"final-fuck-7"},{name:"Five Ways",value:"five-ways"},{name:"Friends Media Station",value:"friends-media-station"},{name:"Front Line",value:"front-line"},{name:"fruit",value:"fruit"},{name:"Godoy",value:"godoy"},{name:"GodoyG",value:"godoyg"},{name:"GOLD BEAR",value:"gold-bear"},{name:"gomasioken",value:"gomasioken"},{name:"Green Bunny",value:"green-bunny"},{name:"Groover",value:"groover"},{name:"Hokiboshi",value:"hokiboshi"},{name:"Hoods Entertainment",value:"hoods-entertainment"},{name:"Hot Bear",value:"hot-bear"},{name:"Hykobo",value:"hykobo"},{name:"IRONBELL",value:"ironbell"},{name:"ITONAMI",value:"itonami"},{name:"Ivory Tower",value:"ivory-tower"},{name:"J.C.",value:"j-c"},{name:"Jellyfish",value:"jellyfish"},{name:"Jewel",value:"jewel"},{name:"Jumondo",value:"jumondo"},{name:"kate_sai",value:"kate_sai"},{name:"KENZsoft",value:"kenzsoft"},{name:"King Bee",value:"king-bee"},{name:"Kitty Media",value:"kitty-media"},{name:"Knack",value:"knack"},{name:"Kuril",value:"kuril"},{name:"L.",value:"l"},{name:"Lemon Heart",value:"lemon-heart"},{name:"Lilix",value:"lilix"},{name:"Lune Pictures",value:"lune-pictures"},{name:"Magic Bus",value:"magic-bus"},{name:"Magin Label",value:"magin-label"},{name:"Majin Petit",value:"majin-petit"},{name:"Marigold",value:"marigold"},{name:"Mary Jane",value:"mary-jane"},{name:"Media Blasters",value:"media-blasters"},{name:"MediaBank",value:"mediabank"},{name:"Metro Notes",value:"metro-notes"},{name:"Milky",value:"milky"},{name:"MiMiA Cute",value:"mimia-cute"},{name:"Moon Rock",value:"moon-rock"},{name:"Moonstone Cherry",value:"moonstone-cherry"},{name:"Mousou Senka",value:"mousou-senka"},{name:"MS Pictures",value:"ms-pictures"},{name:"Muse",value:"muse"},{name:"N43",value:"n43"},{name:"New generation",value:"new-generation"},{name:"Nihikime no Dozeu",value:"nihikime-no-dozeu"},{name:"Nikkatsu Video",value:"nikkatsu-video"},{name:"nur",value:"nur"},{name:"NuTech Digital",value:"nutech-digital"},{name:"Otodeli",value:"otodeli"},{name:"Pashmina",value:"pashmina"},{name:"Passione",value:"passione"},{name:"Peach Pie",value:"peach-pie"},{name:"Pink Pineapple",value:"pink-pineapple"},{name:"Pinkbell",value:"pinkbell"},{name:"Pix",value:"pix"},{name:"Pixy Soft",value:"pixy-soft"},{name:"Pocomo Premium",value:"pocomo-premium"},{name:"PoRO",value:"poro"},{name:"Project No.9",value:"project-no-9"},{name:"Pumpkin Pie",value:"pumpkin-pie"},{name:"Queen Bee",value:"queen-bee"},{name:"Rabbit Gate",value:"rabbit-gate"},{name:"ROJIURA JACK",value:"rojiura-jack"},{name:"sakamotoJ",value:"sakamotoj"},{name:"Sakura Purin",value:"sakura-purin"},{name:"SANDWICHWORKS",value:"sandwichworks"},{name:"Schoolzone",value:"schoolzone"},{name:"seismic",value:"seismic"},{name:"SELFISH",value:"selfish"},{name:"Seven",value:"seven"},{name:"Shadow Prod. Co.",value:"shadow-prod-co"},{name:"Shelf",value:"shelf"},{name:"Shinyusha",value:"shinyusha"},{name:"ShoSai",value:"shosai"},{name:"Showten",value:"showten"},{name:"Soft on Demand",value:"soft-on-demand"},{name:"SoftCell",value:"softcell"},{name:"SPEED",value:"speed"},{name:"STARGATE3D",value:"stargate3d"},{name:"Studio 9 Maiami",value:"studio-9-maiami"},{name:"Studio Akai Shohosen",value:"studio-akai-shohosen"},{name:"Studio Deen",value:"studio-deen"},{name:"Studio Fantasia",value:"studio-fantasia"},{name:"Studio FOW",value:"studio-fow"},{name:"studio GGB",value:"studio-ggb"},{name:"Studio Gokumi",value:"studio-gokumi"},{name:"Studio Houkiboshi",value:"studio-houkiboshi"},{name:"Studio Zealot",value:"studio-zealot"},{name:"Suiseisha",value:"suiseisha"},{name:"Suzuki Mirano",value:"suzuki-mirano"},{name:"SYLD",value:"syld"},{name:"t japan",value:"t-japan"},{name:"T-Rex",value:"t-rex"},{name:"TDK Core",value:"tdk-core"},{name:"TNK",value:"tnk"},{name:"TOHO",value:"toho"},{name:"Toranoana",value:"toranoana"},{name:"Torudaya",value:"torudaya"},{name:"Triangle",value:"triangle"},{name:"Trimax",value:"trimax"},{name:"TYS Work",value:"tys-work"},{name:"U-Jin",value:"u-jin"},{name:"Umemaro-3D",value:"umemaro-3d"},{name:"Union Cho",value:"union-cho"},{name:"Valkyria",value:"valkyria"},{name:"Vanilla",value:"vanilla"},{name:"White Bear",value:"white-bear"},{name:"X City",value:"x-city"},{name:"XTER",value:"xter"},{name:"Y.O.U.C.",value:"y-o-u-c"},{name:"yosino",value:"yosino"},{name:"ZIZ",value:"ziz"}];
        const years = ["2025","2024","2023","2022","2021","2020","2019","2018","2017","2016","2015","2014","2013","2012","2011","2010","2009","2008","2007","2006","2005","2004","2003","2002","2001","2000","1999","1998","1997","1996","1995","1994","1993","1992","1991","1990","1989","1988","1987","1986","1985","1984"];
        const blacklistKeywords = ["Anime","Big Boobs","Big Tits Hentai","Blow Job","Censored","Creampie","Cum in Pussy","e Hentai","Free Hentai","ge Hentai","Gelbooru","Hanime","Hanime TV","HD Hentai","Hentai","Hentai Anime","Hentai Chan","Hentai Foundry","Hentai Haven","Hentai Manga","Hentai Porn","Hentai Stream","Hentai TV","Hentai Vid","Hentai Video","Hentai Videos","HentaiCore","HentaiDude","HentaiFreak","Masturbation","MioHentai","mp4Hentai","Naughty Hentai","nHentai","oHentai","Oral Sex","Orgasm","Porn","Rule 34","Sexy","Tits","Watch Hentai","xAnimePorn","xHentai"];
        const capitalize = (str) => str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        return [
            { type_name: "HeaderFilter", name: "Filters (only for search)" },
            {
                type_name: "SelectFilter",
                key: "sort",
                name: "Sort By",
                state: 0,
                values: sortables.map(s => ({ type_name: "SelectOption", name: s.name, value: s.value }))
            },
            {
                type_name: "SelectFilter",
                key: "brand",
                name: "Brand",
                state: 0,
                values: [{ type_name: "SelectOption", name: "Any", value: "" }, ...brands.map(b => ({ type_name: "SelectOption", name: b.name, value: b.value }))]
            },
            {
                type_name: "SelectFilter",
                key: "year",
                name: "Year",
                state: 0,
                values: [{ type_name: "SelectOption", name: "Any", value: "" }, ...years.map(y => ({ type_name: "SelectOption", name: y, value: y }))]
            },
            {
                type_name: "SelectFilter",
                key: "match",
                name: "Genre Match",
                state: 0,
                values: [{ type_name: "SelectOption", name: "Match All", value: "all" }, { type_name: "SelectOption", name: "Match Any", value: "any" }]
            },
            {
                type_name: "GroupFilter",
                key: "genre",
                name: "Genres (Include)",
                state: genres.map(g => ({ type_name: "CheckBox", name: capitalize(g), value: g.replace(/ /g, '-'), state: false }))
            },
            {
                type_name: "GroupFilter",
                key: "exclude_genre",
                name: "Genres (Exclude)",
                state: genres.map(g => ({ type_name: "CheckBox", name: capitalize(g), value: g.replace(/ /g, '-'), state: false }))
            },
            {
                type_name: "GroupFilter",
                key: "exclude",
                name: "Keywords (Exclude)",
                state: blacklistKeywords.map(k => ({ type_name: "CheckBox", name: k, value: k.toLowerCase().replace(/ /g, '-'), state: false }))
            },
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
