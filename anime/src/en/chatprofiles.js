const mangayomiSources = [
  {
    "name": "ChatProfiles",
    "id": 975318642,
    "baseUrl": "https://chat.chatprofiles.ai",
    "lang": "en",
    "typeSource": "single",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=chatprofiles.ai",
    "itemType": 1,
    "version": "1.0.0",
    "hasCloudflare": false,
    "isNsfw": true,
    "pkgPath": "anime/src/en/chatprofiles.js",
  },
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
    this.DEFAULT_ROOM_LIMIT = 90;
    this.LIVE_THUMB_BASE_URL = "https://thumb.live.mmcdn.com/riw/";
  }

  getPreference(key) {
    return new SharedPreferences().get(key);
  }

  getBaseUrl() {
    const overrideUrl = this.getPreference("chatprofiles_override_base_url");
    if (overrideUrl && overrideUrl.length > 0) {
      return overrideUrl;
    }
    return this.source.baseUrl;
  }

  getHeaders(url = this.getBaseUrl()) {
    return {
      "Referer": url,
      "Origin": this.getBaseUrl(),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
    };
  }

  async requestJson(url) {
    const res = await this.client.get(url, this.getHeaders(url));
    if (res.statusCode !== 200) {
      throw new Error(`Failed to fetch data from ${url}. Status: ${res.statusCode} - ${res.statusText}`);
    }
    return JSON.parse(res.body);
  }

  getImageUrl(username) {
    return `${this.LIVE_THUMB_BASE_URL}${username}.jpg`;
  }

  parseRoomList(data) {
    const list = [];
    const rooms = data.rooms || [];

    rooms.forEach(room => {
      const username = room.username;
      if (!username) return;

      const name = username;
      const link = username;
      const imageUrl = room.img || this.getImageUrl(username);
      
      const extractedGenres = new Set(room.tags || []);
      const subject = room.subject || "";
      const hashtagMatches = subject.match(/#(\w+)/g);
      if (hashtagMatches) {
        hashtagMatches.forEach(match => {
          extractedGenres.add(match.substring(1));
        });
      }

      list.push({ name, link, imageUrl, genre: Array.from(extractedGenres) });
    });

    const hasNextPage = rooms.length === this.DEFAULT_ROOM_LIMIT;
    return { list, hasNextPage };
  }

  async getPopular(page) {
    const offset = (page - 1) * this.DEFAULT_ROOM_LIMIT;
    const url = `${this.getBaseUrl()}/api/ts/roomlist/room-list/?limit=${this.DEFAULT_ROOM_LIMIT}&offset=${offset}`;
    const data = await this.requestJson(url);
    return this.parseRoomList(data);
  }

  async getLatestUpdates(page) {
    return this.getPopular(page);
  }

  async search(query, page, filters) {
    const offset = (page - 1) * this.DEFAULT_ROOM_LIMIT;
    let searchUrl = `${this.getBaseUrl()}/api/ts/roomlist/room-list/?limit=${this.DEFAULT_ROOM_LIMIT}&offset=${offset}`;

    if (query) {
      searchUrl += `&keywords=${encodeURIComponent(query)}`;
    }

    if (filters && filters.length > 0) {
      const getSelectValue = (filter) => filter.values[filter.state]?.value || '';
      const getCheckBoxValues = (filter) => filter.state.filter(item => item.state).map(item => item.value);

      const genderFilter = filters.find(f => f.name === "Gender");
      if (genderFilter && genderFilter.state > 0) { 
        const genderValue = getSelectValue(genderFilter);
        if (genderValue) {
          searchUrl += `&genders=${encodeURIComponent(genderValue)}`;
        }
      }

      const tagsFilter = filters.find(f => f.name === "Tags");
      if (tagsFilter && tagsFilter.state.length > 0) {
        const selectedTags = getCheckBoxValues(tagsFilter);
        if (selectedTags.length > 0) {
          searchUrl += `&hashtags=${encodeURIComponent(selectedTags.join(','))}`;
        }
      }
    }

    const data = await this.requestJson(searchUrl);
    return this.parseRoomList(data);
  }

  async getDetail(username) {
    const detailApiUrl = `${this.getBaseUrl()}/api/chatvideocontext/${username}/`;
    const data = await this.requestJson(detailApiUrl);

    const name = data.broadcaster_username || username;
    const imageUrl = data.summary_card_image || this.getImageUrl(username);
    const description = data.room_title || "";

    const genre = [];
    const hashtagMatches = (data.room_title || "").match(/#(\w+)/g);
    if (hashtagMatches) {
      hashtagMatches.forEach(match => {
        const tagName = match.substring(1);
        if (!genre.includes(tagName)) {
          genre.push(tagName);
        }
      });
    }

    const status = data.room_status === "online" ? 0 : 1; 

    const chapters = [];
    if (data.room_status === "online" && data.hls_source) {
      chapters.push({
        name: "Live Stream",
        url: username,
      });
    } else {
        chapters.push({
            name: "Currently Offline",
            url: "offline_placeholder",
        });
    }

    return { 
      name, 
      imageUrl, 
      description, 
      genre, 
      status, 
      link: username,
      chapters 
    };
  }

  async getVideoList(username) {
    if (username === "offline_placeholder") {
        throw new Error("Broadcaster is currently offline.");
    }
    
    const detailApiUrl = `${this.getBaseUrl()}/api/chatvideocontext/${username}/`;
    const data = await this.requestJson(detailApiUrl);

    const hlsSource = data.hls_source;

    if (!hlsSource) {
      throw new Error("No HLS stream source found or broadcaster is offline.");
    }
    
    let videoUrl = hlsSource;
    if (videoUrl.startsWith("//")) {
        videoUrl = `https:${videoUrl}`;
    } 

    return [{
      url: videoUrl,
      originalUrl: videoUrl,
      quality: "Live Stream",
      headers: this.getHeaders(detailApiUrl),
    }];
  }

  async getFilterList() {
    const filters = [];

    filters.push({
      type_name: "SelectFilter",
      name: "Gender",
      state: 0,
      values: [
        { type_name: "SelectOption", name: "All", value: "" },
        { type_name: "SelectOption", name: "Female", value: "f" },
        { type_name: "SelectOption", name: "Male", value: "m" },
        { type_name: "SelectOption", name: "Couple", value: "c" },
        { type_name: "SelectOption", name: "Trans", value: "t" },
      ],
    });

    let allTags = [];
    let offset = 0;
    let hasMoreTags = true;
    while (hasMoreTags) {
      const tagsApiUrl = `${this.getBaseUrl()}/api/ts/roomlist/all-tags/?limit=${this.DEFAULT_ROOM_LIMIT}&offset=${offset}`;
      const data = await this.requestJson(tagsApiUrl);
      const currentTags = data.all_tags || [];
      allTags = allTags.concat(currentTags);
      
      hasMoreTags = currentTags.length === this.DEFAULT_ROOM_LIMIT;
      offset += this.DEFAULT_ROOM_LIMIT;
    }
    
    const tagOptions = allTags.map(tag => ({
      type_name: "CheckBox",
      name: tag,
      value: tag,
    }));

    filters.push({
      type_name: "GroupFilter",
      name: "Tags",
      state: tagOptions,
    });

    return filters;
  }

  getSourcePreferences() {
    return [
      {
        key: "chatprofiles_override_base_url",
        editTextPreference: {
          title: "Override Base URL",
          summary: "Use a different mirror/domain (e.g., https://sodaprofiles.com)",
          value: this.source.baseUrl,
          dialogTitle: "Enter new Base URL",
          dialogMessage: `Default: ${this.source.baseUrl}`,
        },
      },
    ];
  }
}