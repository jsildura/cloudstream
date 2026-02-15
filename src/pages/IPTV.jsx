import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './IPTV.css';

const M3U_URL = 'https://raw.githubusercontent.com/ryansnetcafe/ott-playlist/refs/heads/main/ryansnetcafe.m3u';
const OFFLINE_CHANNELS_KEY = 'iptv_offline_channels';
const FAVORITES_KEY = 'iptv_favorites';

/**
 * Parse M3U playlist into channel objects
 * Handles two formats:
 * 1. Standard: #EXTINF + #KODIPROP + URL
 * 2. Simple: #KODIPROP + URL (no EXTINF - generate name from URL)
 * Extracts ClearKey DRM info from #KODIPROP lines
 */
const parseM3U = (content) => {
  const lines = content.split('\n');
  const channels = [];
  let pendingLicenseKey = null;
  let pendingLicenseType = null;
  let pendingExtinf = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Parse KODIPROP for DRM info
    if (line.startsWith('#KODIPROP:inputstream.adaptive.license_type=')) {
      pendingLicenseType = line.split('=')[1];
    } else if (line.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
      pendingLicenseKey = line.split('=')[1];
    } else if (line.startsWith('#EXTINF:')) {
      // Check for TVPass group - skip these
      if (line.includes('group-title="TVPass"')) {
        pendingExtinf = { skip: true };
      } else {
        // Store EXTINF info for the next URL line
        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
        const groupMatch = line.match(/group-title="([^"]*)"/);
        const nameMatch = line.match(/,(.+)$/);
        pendingExtinf = {
          name: nameMatch ? nameMatch[1].trim() : null,
          logo: logoMatch ? logoMatch[1] : null,
          category: groupMatch ? groupMatch[1] : 'Entertainment',
          skip: false
        };
      }
    } else if (line && !line.startsWith('#')) {
      // Skip if explicitly marked to skip (TVPass)
      if (pendingExtinf?.skip) {
        pendingLicenseKey = null;
        pendingLicenseType = null;
        pendingExtinf = null;
        continue;
      }

      // This is a stream URL - create channel
      let channelName = pendingExtinf?.name;
      let channelLogo = pendingExtinf?.logo;
      let mappleId = null;

      // Try to extract Mapple ID from URL (e.g., .../premium303/...)
      // This is slightly speculative, but based on the URL structure:
      // https://nfsnew.kiko2.ru/nfs/premium303/mono.css -> 303
      // https://nfsnew.kiko2.ru/nfs/premium123/mono.css -> 123
      const mappleMatch = line.match(/premium(\d+)/);
      if (mappleMatch) {
        mappleId = mappleMatch[1];
      }

      // If no EXTINF, try to generate name from URL
      if (!channelName) {
        // Extract channel name from URL path (e.g., /bpk-tv/cg_animal_planet_sd/ → Animal Planet SD)
        const urlMatch = line.match(/\/bpk-tv\/([^/]+)\//);
        if (urlMatch) {
          channelName = urlMatch[1]
            .replace(/^cg_/, '') // Remove cg_ prefix
            .replace(/_/g, ' ')  // Replace underscores with spaces
            .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize words
        } else {
          channelName = `Channel ${channels.length + 1}`;
        }
      }

      channels.push({
        id: channels.length,
        name: channelName,
        logo: channelLogo,
        category: pendingExtinf?.category || 'Entertainment',
        url: line,
        licenseType: pendingLicenseKey ? 'clearkey' : null, // Assume clearkey if key present
        licenseKey: pendingLicenseKey,
        mappleId: mappleId
      });

      // Reset pending values after using them
      pendingLicenseKey = null;
      pendingLicenseType = null;
      pendingExtinf = null;
    }
  }

  return channels;
};


/**
 * Load offline channels from localStorage
 */
const loadOfflineChannels = () => {
  try {
    const saved = localStorage.getItem(OFFLINE_CHANNELS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

/**
 * Save offline channels to localStorage
 */
const saveOfflineChannels = (ids) => {
  try {
    localStorage.setItem(OFFLINE_CHANNELS_KEY, JSON.stringify(ids));
  } catch (e) {
    console.error('Error saving offline channels:', e);
  }
};

/**
 * Load favorites from localStorage
 */
const loadFavorites = () => {
  try {
    const saved = localStorage.getItem(FAVORITES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

/**
 * Save favorites to localStorage
 */
const saveFavorites = (ids) => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch (e) {
    console.error('Error saving favorites:', e);
  }
};

const IPTV = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('All');
  const [offlineChannels, setOfflineChannels] = useState(() => loadOfflineChannels());
  const [favorites, setFavorites] = useState(() => loadFavorites());

  // Check if returning from a failed channel
  useEffect(() => {
    if (location.state?.markOffline !== undefined) {
      const channelId = location.state.markOffline;
      if (!offlineChannels.includes(channelId)) {
        const updated = [...offlineChannels, channelId];
        setOfflineChannels(updated);
        saveOfflineChannels(updated);
      }
      // Clear the state
      navigate('/iptv', { replace: true, state: {} });
    }
  }, [location.state, offlineChannels, navigate]);

  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        setLoading(true);
        const response = await fetch(M3U_URL);
        if (!response.ok) throw new Error('Failed to fetch playlist');
        const text = await response.text();
        const parsed = parseM3U(text);

        // Add manual/test channels (Mapple)
        const manualChannels = [

          //  {
          //    id: 'mapple-amc',
          //   name: 'AMC USA',
          //   logo: '/channels/amc_logo.png',
          //    url: 'https://nfsnew.kiko2.ru/nfs/premium303/mono.css',
          //  mappleId: '303',
          //  licenseType: 'clearkey' // Dynamic via harvester
          //  }, 

          // {
          //  id: 'mapple-ahc',
          //  name: 'AHC (American Heroes Channel)',
          //  logo: '/channels/American_Heroes_Channel_logo.png',
          //  category: 'Documentary',
          //  url: 'https://ddy6new.kiko2.ru/ddy6/premium206/mono.css',
          //  mappleId: '206',
          //  licenseType: 'clearkey'
          // },
          // === SHAKZZ CHANNELS (ClearKey - works on mobile!) ===

          // Movies
          {
            id: 'cinema-one',
            name: 'Cinema One',
            logo: 'https://download.logo.wine/logo/Cinema_One/Cinema_One-Logo.wine.png',
            category: 'Movies',
            url: 'https://d9rpesrrg1bdi.cloudfront.net/out/v1/93b9db7b231d45f28f64f29b86dc6c65/index.mpd',
            licenseKey: '58d0e56991194043b8fb82feb4db7276:d68f41b59649676788889e19fb10d22c'
          },
          // Documentary
          {
            id: 'bbc-earth',
            name: 'BBC Earth',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/BBC_Earth.svg',
            category: 'Documentary',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_bbcearth_hd1/default/index.mpd',
            licenseKey: '34ce95b60c424e169619816c5181aded:0e2a2117d705613542618f58bf26fc8e'
          },
          // Entertainment
          {
            id: 'axn',
            name: 'AXN',
            logo: 'https://icon2.cleanpng.com/20180702/pfc/kisspng-axn-television-channel-sony-channel-television-sho-axn-5b3a0ac39f5e85.1062681315305304996528.jpg',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_axn_sd/default/index.mpd',
            licenseKey: '8a6c2f1e9d7b4c5aa1f04d2b7e9c1f88:05e6bfa4b6805c46b772f35326b26b36'
          },
          // HLS Channels (No DRM)
          {
            id: 'bbc-impossible',
            name: 'BBC Impossible',
            logo: 'https://i.imgur.com/IlIPwWV.png',
            category: 'Entertainment',
            url: 'https://bbc-impossible-1-us.xumo.wurl.tv/4300.m3u8'
          },
          {
            id: 'amc-thrillers',
            name: 'AMC Thrillers',
            logo: 'https://provider-static.plex.tv/6/epg/channels/logos/gracenote/6e7af423114c9f735d17e142783f233a.png',
            category: 'Movies',
            url: 'https://436f59579436473e8168284cac5d725f.mediatailor.us-east-1.amazonaws.com/v1/master/44f73ba4d03e9607dcd9bebdcb8494d86964f1d8/Plex_RushByAMC/playlist.m3u8'
          },
          {
            id: 'anime-hidive',
            name: 'Anime X Hidive',
            logo: 'https://www.tablotv.com/wp-content/uploads/2023/12/AnimeXHIDIVE_official-768x499.png',
            category: 'Kids',
            url: 'https://amc-anime-x-hidive-1-us.tablo.wurl.tv/playlist.m3u8'
          },
          {
            id: 'animex',
            name: 'AnimeX',
            logo: 'https://logomakerr.ai/uploads/output/2023/08/01/8d87f4803925f46fcdb6b9ae8a1e6244.jpg',
            category: 'Kids',
            url: 'https://live20.bozztv.com/giatv/giatv-animex/animex/chunks.m3u8'
          },
          {
            id: 'angry-birds',
            name: 'Angry Birds',
            logo: 'https://www.pikpng.com/pngl/m/83-834869_angry-birds-theme-angry-birds-game-logo-png.png',
            category: 'Kids',
            url: 'https://stream-us-east-1.getpublica.com/playlist.m3u8?network_id=547'
          },
          {
            id: 'kidoodle',
            name: 'Kidoodle TV',
            logo: 'https://d1iiooxwdowqwr.cloudfront.net/pub/appsubmissions/20201230211817_FullLogoColor4x.png',
            category: 'Kids',
            url: 'https://amg07653-apmc-amg07653c5-samsung-ph-8539.playouts.now.amagi.tv/playlist.m3u8'
          },
          // Added: ABC, AMC+, ANC + Others
          {
            id: 'abc-australia',
            name: 'ABC Australia',
            logo: 'https://i.pinimg.com/736x/5a/66/65/5a666508bc5851a6a9c1151e7eefff3d.jpg',
            category: 'News',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/abc_aus/default/index.mpd',
            licenseKey: 'd6f1a8c29b7e4d5a8f332c1e9d7b6a90:790bd17b9e623e832003a993a2de1d87'
          },
          {
            id: 'amc-plus',
            name: 'AMC+',
            logo: 'https://shop.amc.com/cdn/shop/products/AMCP-LOGO-100011-FR-RO_1500x.png?v=1650990755',
            category: 'Entertainment',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/PDX/clients/dash/enc/0f5clvxn6o/out/v1/d5a953bb19734fa3baa1776266887fcb/cenc.mpd',
            licenseKey: '59a51164c2c915352f04066a06f6e807:eba5cc362d1d63c0fe6460febca0fd11'
          },
          {
            id: 'anc',
            name: 'ANC',
            logo: 'https://data-corporate.abs-cbn.com/corp/medialibrary/dotcom/corp news sports 2020/anc station id/anc goes global_2.jpg',
            category: 'News',
            url: 'https://d3cjss68xc4sia.cloudfront.net/out/v1/89ea8db23cb24a91bfa5d0795f8d759e/index.mpd',
            licenseKey: '4bbdc78024a54662854b412d01fafa16:6039ec9b213aca913821677a28bd78ae'
          },
          // === NEW ADDITIONS (Pinoy, Sports, Entertainment) ===
          {
            id: 'gma7',
            name: 'GMA 7',
            logo: 'https://ottepg8.comclark.com:8443/iptvepg/images/markurl/mark_1723126306082.png',
            category: 'Pinoy',
            url: 'https://gsattv.akamaized.net/live/media0/gma7/Widevine/gma7.mpd'
          },
          {
            id: 'red-bull',
            name: 'Red Bull TV',
            logo: 'https://i.imgur.com/Ju6FJNA.png',
            category: 'Sports',
            url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master_3360.m3u8'
          },
          {
            id: 'uaap-varsity-channel',
            name: 'UAAP Varsity Channel',
            logo: 'https://i.imgur.com/V0sxXci.png',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/cg_uaap_cplay_sd/default/index.mpd',
            licenseKey: '95588338ee37423e99358a6d431324b9:6e0f50a12f36599a55073868f814e81e'
          },
          {
            id: 'jeepney-tv',
            name: 'Jeepney TV',
            logo: 'https://upload.wikimedia.org/wikipedia/en/1/15/Jeepney_TV_Logo_2015.svg',
            category: 'Pinoy',
            url: 'https://abslive.akamaized.net/dash/live/2027618/jeepneytv/manifest.mpd',
            licenseKey: 'dc9fec234a5841bb8d06e92042c741ec:225676f32612dc803cb4d0f950d063d0'
          },
          {
            id: 'rock-entertainment',
            name: 'Rock Entertainment',
            logo: 'https://i.imgur.com/fx1Y2Eh.png',
            category: 'Entertainment',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/dr_rockentertainment/default/index.mpd',
            licenseKey: 'a8b2d6f14c9e4d7a8f552c1e9b7d6a30:b61a33a4281e7c8e68b24b9af466f7b4'
          },
          {
            id: 'aniplus',
            name: 'Aniplus',
            logo: 'https://i.imgur.com/TXTluER.png',
            category: 'Kids',
            url: 'https://amg18481-amg18481c1-amgplt0352.playout.now3.amagi.tv/playlist/amg18481-amg18481c1-amgplt0352/playlist.m3u8'
          },
          {
            id: 'zoomoo',
            name: 'Zoo Moo Asia',
            logo: 'https://ia803207.us.archive.org/32/items/zoo-moo-kids-2020_202006/ZooMoo-Kids-2020.png',
            category: 'Kids',
            url: 'https://zoomoo-samsungau.amagi.tv/playlist.m3u8'
          },
          {
            id: 'premier-league',
            name: 'Premier League',
            logo: 'https://logos-world.net/wp-content/uploads/2023/02/Premier-League-Logo-2007.png',
            category: 'Sports',
            url: 'https://fsly.stream.peacocktv.com/Content/CMAF_CTR-4s/Live/channel(vc1021n07j)/master.mpd',
            licenseKey: '002046c9a49b9ab1cdb6616bec5d26c3:d2f92f6b7edc9a1a05d393ba0c20ef9e'
          },
          {
            id: 'bbc-news',
            name: 'BBC News',
            category: 'News',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/BBC_News_2022_(Alt).svg/1200px-BBC_News_2022_(Alt).svg.png',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/bbcworld_news_sd/default/index.mpd',
            licenseKey: 'f59650be475e4c34a844d4e2062f71f3:119639e849ddee96c4cec2f2b6b09b40'
          },
          // === NEW iWatchTV CHANNELS ===
          {
            id: 'iwatch-new-korean-movies',
            name: 'New Korean Movies',
            logo: 'https://i.imgur.com/NuGi9x1.jpeg',
            category: 'Movies',
            url: 'https://dbrb49pjoymg4.cloudfront.net/manifest/3fec3e5cac39a52b2132f9c66c83dae043dc17d4/prod_default_xumo-ams-aws/0e99c6ec-a912-4cfd-ad60-59c3223ae77d/5.m3u8'
          },
          {
            id: 'iwatch-universal-movies',
            name: 'Universal Movies',
            logo: 'https://i.imgur.com/0rq9qX4.png',
            category: 'Movies',
            url: 'https://d4whmvwm0rdvi.cloudfront.net/10007/99991621/hls/master.m3u8?ads.xumo_channelId=99991621&ads.asnw=169843&ads.afid=158702674&ads.sfid=16926435&ads.csid=xumo_desktopweb_rottentomatoesrttv_ssaicro&ads._fw_is_lat=0&ads._fw_us_privacy=1YNN&ads._fw_coppa=0&ads._fw_did=413d7e29-b63e-b34e-b143-bf0efe32f394&ads._fw_vcid2=512116:413d7e29-b63e-b34e-b143-bf0efe32f394&ads._fw_app_bundle=&ads._fw_app_store_url=&ads._fw_content_category=IAB1-5&ads._fw_content_genre=Movies&ads._fw_content_language=en&ads._fw_content_rating=TV-PG&ads._fw_deviceMake=&ads._fw_device_model=&ads._fw_deviceType=2-Personal_Computer&ads.appVersion=2.18.0&ads.appName=xumo&ads.xumo_contentId=2659&ads.xumo_contentName=RottenTomatoesRTTV&ads.xumo_providerId=2659&ads.xumo_providerName=RottenTomatoesRTTV&ads.channelId=99991621&ads._fw_ifa_type=dpid&ads.site_name=XumoPlay&ads.site_page=https%253A%252F%252Fplay.xumo.com'
          },
          {
            id: 'iwatch-dove-channel',
            name: 'Dove Channel',
            logo: 'https://i.ibb.co/t3dXphQ/download-2024-06-27-T073317-555.png',
            category: 'Entertainment',
            url: 'https://linear-896.frequency.stream/dist/xumo/896/hls/master/playlist_1280x720.m3u8'
          },
          {
            id: 'iwatch-ragetv',
            name: 'Rage TV',
            logo: 'https://i.imgur.com/E3q2kTu.png',
            category: 'Entertainment',
            url: 'https://live20.bozztv.com/giatv/giatv-ragetv/ragetv/chunks.m3u8'
          },
          {
            id: 'iwatch-comicu',
            name: 'Comic U',
            logo: 'https://i.imgur.com/ziTlvlL.jpeg',
            category: 'Entertainment',
            url: 'https://amg19223-amg19223c8-amgplt0351.playout.now3.amagi.tv/playlist/amg19223-amg19223c8-amgplt0351/playlist.m3u8'
          },
          {
            id: 'iwatch-red-box-movies',
            name: 'Red Box Movies',
            logo: 'https://i.imgur.com/OrGCnPg.jpg',
            category: 'Movies',
            url: 'https://7732c5436342497882363a8cd14ceff4.mediatailor.us-east-1.amazonaws.com/v1/master/04fd913bb278d8775298c26fdca9d9841f37601f/Plex_NewMovies/playlist.m3u8'
          },
          // === Source Live Play ===
          {
            id: 'iwatch-dubai-one',
            name: 'Dubai One',
            logo: 'https://i.ibb.co/rvWwhkx/download-31.png',
            category: 'Entertainment',
            url: 'https://dminnvllta.cdn.mgmlcdn.com/dubaione/smil:dubaione.stream.smil/chunklist_b1300000.m3u8'
          },
          {
            id: 'iwatch-asian-crush',
            name: 'Asian Crush',
            logo: 'https://i.imgur.com/fUg91vw.jpeg',
            category: 'Movies',
            url: 'https://cineverse.g-mana.live/media/1ebfbe30-c35c-4404-8bc5-0339d750eb58/mainManifest.m3u8?app_bundle=https://www.asiancrush.com&app_name=asiancrush&app_store_url=&url=https://www.asiancrush.com&genre=Documentary,Independent,Sci-Fi%20&%20Fantasy,Kids%20&%20Family,Drama,Romance,Comedy,Action%20&%20Adventure,Sports&ic=&us_privacy=1YNN&gdpr=0&gdpr_consent=0&did=vir_webe2f1f1c449b2b43d72e1a991a25f2666&dnt=1&coppa=0'
          },
          {
            id: 'spotv',
            name: 'SPOTV',
            logo: 'https://ownassetsmysky.blob.core.windows.net/assetsmysky/production/media-upload/1634257286_thumb-spotv.png',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_spotvhd/default/index.mpd',
            licenseKey: 'ec7ee27d83764e4b845c48cca31c8eef:9c0e4191203fccb0fde34ee29999129e'
          },
          {
            id: 'spotv2',
            name: 'SPOTV 2',
            logo: 'https://ownassetsmysky.blob.core.windows.net/assetsmysky/production/media-upload/1634257305_thumb-spotv-2.png',
            category: 'Sports',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/cg_spotv2hd/default/index.mpd',
            licenseKey: '7eea72d6075245a99ee3255603d58853:6848ef60575579bf4d415db1032153ed'
          },
          {
            id: 'cna',
            name: 'Channel News Asia',
            logo: 'https://logowik.com/content/uploads/images/cna-channel-news-asia9392.jpg',
            category: 'News',
            url: 'https://tglmp03.akamaized.net/out/v1/43856347987b4da3890360b0d18b5dc5/manifest.mpd',
            licenseKey: '4ee336861eed4840a555788dc54aea6e:f1f53644d4941d4ed31b4bb2478f8cf4'
          },
          // === Source LivePlay ===
          {
            id: 'kapatid-channel',
            name: 'Kapatid Channel',
            category: 'Entertainment',
            logo: 'https://liveplay.vercel.app/assets/kapatid_channel_logo.png',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/pphd_sdi1/default/index.mpd',
            licenseKey: 'dbf670bed2ea4905a114557e90e7ffb6:616059bec8dfb27f3524b7e7c31b6cff'
          },
          {
            id: 'wiltv',
            name: 'Wil TV',
            category: 'Entertainment',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/WILTV_logo.svg/500px-WILTV_logo.svg.png',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/wiltv/default/index.mpd',
            licenseKey: 'b1773d6f982242cdb0f694546a3db26f:ae9a90dbea78f564eb98fe817909ec9a'
          },
          {
            id: 'crave-1',
            name: 'Crave',
            category: 'Movies',
            logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave1.png',
            url: 'https://live-crave.video.9c9media.com/137c6e2e72e1bf67b82614c7c9b216d6f3a8c8281748505659713/fe/f/crave/crave1/manifest.mpd',
            licenseKey: '4a107945066f45a9af2c32ea88be60f4:df97e849d68479ec16e395feda7627d0'
          },
          {
            id: 'crave-2',
            name: 'Crave 2',
            category: 'Movies',
            logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave2.png',
            url: 'https://live-crave.video.9c9media.com/ab4332c60e19b6629129eeb38a2a6ac6db5df2571721750022187/fe/f/crave/crave2/manifest.mpd',
            licenseKey: '4ac6eaaf0e5e4f94987cbb5b243b54e8:8bb3f2f421f6afd025fa46c784944ad6'
          },
          {
            id: 'crave-3',
            name: 'Crave 3',
            category: 'Movies',
            logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave3.png',
            url: 'https://live-crave.video.9c9media.com/58def7d65f59ffaf995238981dd0e276d5a8fe8d1748593014588/fe/f/crave/crave3/manifest.mpd',
            licenseKey: 'eac7cd7979f04288bc335fc1d88fa344:0fca71cf91b3c4931ad3cf66c631c24c'
          },
          {
            id: 'crave-4',
            name: 'Crave 4',
            category: 'Movies',
            logo: 'https://www.start.ca/wp-content/uploads/2022/09/StartTV_ChannelLogos_Crave4.png',
            url: 'https://live-crave.video.9c9media.com/c5875a31f178e038f7cc572b1aa0defb996ce7171748593186018/fe/f/crave/crave4/manifest.mpd',
            licenseKey: 'a7242a7026ff45609114ee1f3beb34dc:65c32ada65548203a3683d5d37dd3a06'
          },
          {
            id: 'bein-sports1',
            name: 'BeIN Sports 1',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Logo_bein_sports_1.png/1200px-Logo_bein_sports_1.png',
            url: 'https://aba5sdmaaaaaaaamdwujas5g6mg4r.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/clients/dash/enc/ghwcl6hv68/out/v1/83536910d8034e9b9895a20fbe1c1687/cenc.mpd',
            licenseKey: '335dad778109954503dcbb21dc92015f:24bfd75d436cbf73168a2a2dccd40281'
          },
          {
            id: 'bein-sports2',
            name: 'BeIN Sports 2',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Logo_bein_sports_2.png/1200px-Logo_bein_sports_2.png',
            url: 'https://aba5sdmaaaaaaaamdwujas5g6mg4r.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/clients/dash/enc/8m8cd46i1t/out/v1/83985c68e4174e90a58a1f2c024be4c9/cenc.mpd',
            licenseKey: '0b42be2664d7e811d04f3e504e0924c5:ae24090123b8c72ac5404dc152847cb8'
          },
          {
            id: 'bein-sports3',
            name: 'BeIN Sports 3',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Logo_bein_sports_3.png/1200px-Logo_bein_sports_3.png',
            url: 'https://aba5sdmaaaaaaaamhq2w5oosrf5ae.otte.live.cf.ww.aiv-cdn.net/syd-nitro/live/dash/enc/q4u5nwaogz/out/v1/18de6d3e65934f3a8de4358e69eab86c/cenc.mpd',
            licenseKey: '7995c724a13748ed970840a8ab5bb9b3:67bdaf1e2175b9ff682fcdf0e2354b1e'
          },
          {
            id: 'eurosport-1',
            name: 'Eurosport 1',
            category: 'Sports',
            logo: '	https://liveplay.vercel.app/assets/eurosport1_logo.svg',
            url: 'https://v4-pan-n79-cdn-01.live.cdn.cgates.lt/live/dash/561802/index.mpd',
            licenseKey: '01a665d487aa4c1c898c9eb0ff1a21df:a0b9df5f92e6b218ddb6aa40a2cd996d'
          },
          {
            id: 'eurosport-2',
            name: 'Eurosport 2',
            category: 'Sports',
            logo: 'https://liveplay.vercel.app/assets/eurosport2_logo.svg',
            url: 'https://v4-pan-n79-cdn-01.live.cdn.cgates.lt/live/dash/561705/index.mpd',
            licenseKey: '657707bbd1e240e08bd6969df27fef7c:364e00581c1432f4175e4a2e8e0cd57e'
          },
          {
            id: 'nfl-network',
            name: 'NFL Network',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/National_Football_League_logo.svg/873px-National_Football_League_logo.svg.png',
            url: 'https://ac-009.live.p7s1video.net/e0e064c8/t_004/ran-nflnetwork-de-hd/cenc-default.mpd',
            licenseKey: 'b26a662a10074eb0756404c8e90e765a:76e376bd25f92bed939435d982f92d3f'
          },
          {
            id: 'fifa',
            name: 'Fifa',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/FIFA%2B_%282025%29.svg/2560px-FIFA%2B_%282025%29.svg.png',
            url: 'https://ca333c39.wurl.com/v1/sysdata_s_p_a_fifa_6/ohlscdn_us/V00000003/0/HLS/playlist_3000k_20260113T143637.m3u8'
          },
          {
            id: 'tsn-1',
            name: 'TSN 1',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn1-light.webp',
            url: 'https://ca333c39.wurl.com/v1/sysdata_s_p_a_fifa_6/ohlscdn_us/V00000000/0/HLS/playlist_3000k_20251020T100738.m3u8',
            licenseKey: '7e99f734748d098cbfa2f7bde968dd44:98ea6088c3222e9abaf61e537804d6cc'
          },
          {
            id: 'tsn-2',
            name: 'TSN 2',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn2-light.webp',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/v5v9yfn62i/out/v1/0991e33d09da46b2857fcc845db95c40/cenc.mpd',
            licenseKey: '362202eefc5d9e42eec6450998cce9e8:978dfdd53186ec587d940e0bd1e2ec42'
          },
          {
            id: 'tsn-3',
            name: 'TSN 3',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn3-light.webp',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/mrskysvotx/out/v1/ad58961bd8fd48d2944e461c034b8914/cenc.mpd',
            licenseKey: 'd9097a1b7d04b7786b29f2b0e155316d:279695ebe0fb1bc5787422b6b59ce8a8'
          },
          {
            id: 'tsn-4',
            name: 'TSN 4',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn4-light.webp',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/irtfdsri14/out/v1/165128c314e944faa3d79e107974b323/cenc.mpd',
            licenseKey: 'e1aa4c4daf6222a04f7ae80130495ea1:31bb1ee9a8d088f62b0103550c301449'
          },
          {
            id: 'tsn-5',
            name: 'TSN 5',
            category: 'Sports',
            logo: 'https://bellmedia-images.stats.bellmedia.ca/images/sports/channel-logos/tsn5-light.webp',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/lhr-nitro/live/clients/dash/enc/mttgh1c4ei/out/v1/9cc664b146744e2ba23066aa048efbc5/cenc.mpd',
            licenseKey: '8ce20e2a4b3dd04e0a6e5469b7cb47be:163c323b65d0597b13f037641fd67b1e'
          },
          {
            id: 'bbc-cbeebies',
            name: 'BBC CBeebies',
            category: 'Kids',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/CBeebies_logo_with_outline.svg/1200px-CBeebies_logo_with_outline.svg.png',
            url: 'https://viamotionhsi.netplus.ch/live/eds/bbc4cbeebies/browser-dash/bbc4cbeebies.mpd'
          },
          {
            id: 'myx',
            name: 'MYX',
            category: 'Music',
            logo: 'https://assets-myxglobal.abs-cbn.com/wp-content/uploads/2022/07/MYX_New_Logo_Web1.png',
            url: 'https://d24xfhmhdb6r0q.cloudfront.net/out/v1/e897a7b6414a46019818ee9f2c081c4f/index.mpd'
          },
          {
            id: 'vevopop',
            name: 'Vevopop',
            category: 'Music',
            logo: 'https://liveplay.vercel.app/assets/vevopop_logo.svg',
            url: 'https://amg00056-amg00056c6-rakuten-uk-3235.playouts.now.amagi.tv/1080p/index.m3u8'
          },
          {
            id: 'mtv',
            name: 'MTV',
            category: 'Music',
            logo: 'https://static.wikia.nocookie.net/logopedia/images/5/58/MTV_Live_%28orange%29.svg',
            url: 'https://moj.myiyad.workers.dev/MTV/index.m3u8'
          },
          {
            id: 'kix',
            name: 'KIX',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/KIX_logo.svg',
            url: 'https://qp-pldt-live-bpk-01-prod.akamaized.net/bpk-tv/kix_hd1/default/index.mpd',
            licenseKey: 'c9d4b7a18e2f4d6c9a103f5b7e1c2d88:7f3139092bf87d8aa51ee40e6294d376'
          },
          {
            id: 'animal-planet-hd-in',
            name: 'Animal Planet HD (IN)',
            category: 'Documentary',
            logo: 'https://wildaid.org/wp-content/uploads/2021/08/animal-planet-logo-white.png',
            url: 'https://d1g8wgjurz8via.cloudfront.net/bpk-tv/Animalplanethd2/default/index.mpd',
            licenseKey: 'df81f15150f74c799fdde64ef49dfb75:05794a012ae74d77953f2b9fae6804c7'
          },
          {
            id: 'love-nature',
            name: 'Love Nature',
            category: 'Documentary',
            logo: 'https://blueantmedia.com/wp-content/uploads/2025/02/LoveNature2024_Logo_Coral-768x304.png',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/dub-nitro/live/dash/enc/utcsjvt6qk/out/v1/8ee87ae683ec4b458720621cb2244937/cenc.mpd',
            licenseKey: 'cec4c3c055a7f7e496cbe3abe06ae7c3:6b96bdc30b53ae19d40b4e17c66e5afd'
          },
          {
            id: 'pbb-all-access',
            name: 'PBB All Access',
            category: 'Entertainment',
            logo: 'https://static.wikia.nocookie.net/bigbrother/images/d/dc/PBBCOLLAB2_EYE.png',
            url: 'https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-pbb-live-dash-abscbnono/index.mpd'
          },
          {
            id: 'pbb-catch-up-livestream',
            name: 'PBB Catch-Up Livestream',
            category: 'Entertainment',
            logo: 'https://static.wikia.nocookie.net/bigbrother/images/d/dc/PBBCOLLAB2_EYE.png',
            url: 'https://abslive.akamaized.net/dash/live/2032648/event2/manifest.mpd',
            licenseKey: 'b93c215d3a8042f883acff6444c9f087:056b82112064371cae8c047fe65e9a26'
          },
          {
            id: 'yourface-sounds-familiar-catch-up-livestream',
            name: 'Yourface Sounds Familiar Catch-Up Livestream',
            category: 'Entertainment',
            logo: 'https://pql-static.abs-cbn.com/images/master/YFSF_LIVETITLETREATMENT_2025_V1_png_20251003100022.png',
            url: 'https://abslive.akamaized.net/dash/live/2027618/event4-3/manifest.mpd',
            licenseKey: '3b38b047c273424dbe1b9c64468f9bbb:40703c379a41bf95eb84d620fd718bd4'
          },
          {
            id: 'sea-games-ph-total-sports',
            name: 'Sea Games PH Total Sports',
            category: 'Sports',
            logo: 'https://pilipinaslive.com/assets/images/logo/pilipinaslive-logo.svg',
            url: 'https://qp-pldt-live-bpk-02-prod.akamaized.net/bpk-tv/pp_ch2_pri/default/index.mpd',
            licenseKey: '4fef00332d7e4fbc8f7005dfbf851a59:a6368c181358f3e527411a6c452c6a1a'
          },

          // Latest Channels Added - Source Deprecated
          {
            id: 'national-geographic',
            name: 'National Geographic',
            category: 'Documentary',
            logo: '/channels/national_geographic.png',
            url: 'https://fl31.moveonjoy.com/National_Geographic/index.m3u8'
          },
          {
            id: 'nat-geo-wild',
            name: 'Nat Geo Wild',
            logo: '/channels/national_geo_wild.png',
            url: 'https://moj.myiyad.workers.dev/Nat_Geo_Wild/index.m3u8'
          },

          // Source www.distro.tv/live
          {
            id: 'wild-nature',
            name: 'Wild Nature',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/23208/wild-nature/logo_20250401_214215_70.png',
            url: 'https://dg5rg8emlfy55.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WildNature2/491.m3u8?ads.dpname=distrotv&ads.rnd=t2gs&ads.env_i=1b44d0a6-a32a-4be7-a52c-facf3cdd98c4&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23208&ads.content_duration=18000&ads.episode_id=139666&ads.show_id=5311&ads.showCategories=IAB20&ads.episodeCategories=IAB20&ads.genre=Travel%2CNature%2COutdoors%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Wild%20Nature&ads.episodetitle=Wild%20Nature&ads.keywords=Nature%2COutdoors%2CWild%20Life%2Cdeer%2Celk%2Cbear%2Cwhitetail%2Cturkey%2Csheep%2Cmountain%20goat%2Cwaterfowl%2Cgeese%2Cmule%20deer%2Ccoyote&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.islive=1&ads.streamtype=live&ads.vf=bMSH8FQZL90'
          },
          {
            id: 'euronews',
            name: 'Euronews (EN)',
            category: 'News',
            logo: 'https://a.jsrdn.com/hls/22886/euronews/logo_20231218_175557_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/euronews/euronews-en.m3u8?ads.dpname=distrotv&ads.rnd=tpd6&ads.env_i=4e83602e-7b56-4c2f-b94e-472251abab81&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22886&ads.content_duration=18000&ads.episode_id=45143&ads.show_id=1244&ads.showCategories=IAB12&ads.episodeCategories=IAB12&ads.genre=News%2CGlobal%20News%2CEnglish&ads.showRating=TV-PG&ads.episodeRating=TV-PG&ads.language=en&ads.showtitle=Euronews&ads.episodetitle=Euronews&ads.keywords=euronnews&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=SI66KXKjTgC'
          },
          {
            id: 'unleashed-dogtv',
            name: 'Unleashed by DOGTV',
            category: 'Reality',
            logo: 'https://a.jsrdn.com/hls/23231/unleashed-by-dogtv/logo_20251030_220003_68.png',
            url: 'https://amg26269-amg26269c2-distrotv-us-8939.playouts.now.amagi.tv/ts-us-e2-n1/playlist/amg26269-dogtv-unleashedbydogtv-distrotvus/cb543d1e786c648e9dd43765cef043a2f9591fde1d6988693eb5518975d1073edce2a59caa08ff16388f1ede7f0a66413a3e951fda77118fd87eb141453c5728cfffe729a2c05616b7db083429b56a062a866a68ac39437ed0e21f48a238b6720a5aa82a66443d80b846ac7251db80148b61299bce8c37683f03409a5e5afba358b1ebe85e468b6af7b94a55c07d4de39f43c8821ca6d1860dcb5ed270f710cc9bf88b821985849b729368e3301a16236d89bf6f96db4ebfd5941b57f61d7a164c04b6f6c2ad1f6cd2161927928ecabb76b116de80368e643289018c468a37f80dc06d93d70387f7f3b532403db78a5e712eb3eaa48fef3c27b16389d683af467295f3156b4fcc6998203278b4d2ec20b29946fcdf2281a7271836d6ae4ce9dbd8c7b6e6d51a9e239297b9c93b14192e5051d20bef9b358c71907bfa9b1220591e1dfe9c0796dca23442634b95ce5ad10512badea882cb0b3cc57202288d0aba4c006e964c0612e429ead42f789b230b882124eb5d47e62898b425e3a2819f6c55b4dad40cfa7fe6a605d6f33da0694e3168d5a3780c131a2e8a9c0c66317dd00be3d6c5d56e19059e94a79f9209476d4116561fc5e6e266928dc50a1218cf5625747d1f19a21dc66cad6323617c936db9c6087096482928efa037492809fcabe0d9d78c852edb7ed7dcb33a20354d66b327103462a1cbe722f52c5f6e6907cf407354aa495e4bf981dbead7947881906dbc3d2d4e15af9816451a1c7d62079ee202bd36c69a0ead89c568fab5f978228438b04f1c9fc4ae05928ad8891657c9f8074310fdbd26c16063c312c2228bd75dd9bb50747956237fc78c0e8b35d4de9ed4659e29bb46007bce568fee80d9b7360c90fb2232371a1b1b705c715e67d2b384365235b4ec7fbe0dbc9e3fc24350207154d68d17618fec057af6512b33f2f491cac7a70214d920f779c0650db268043e93bc5284d2e2a0b4d63f034e81e5e51de8f3d2eea6b1cb226d456b3594b33b3f15e80eaae36d89ac196fa18e8ff5c81cf41f8365e1fbdc5ae538b385bf01a08498f0ef48134b4856e8c8f8f466bcd66f14e32b8b1d7760f6e4e5f076b5c9b4086fd85cf48c0969dc581439fd9db6239269d289382ef4c96849c55733d5e5f8290ed156c84a5f78ffd9847c2fceca019e489581ad4a26e1091af7094d69a36bee8eab656a93c8797264e307028d648ccddd1c5b6beeb649021e3b566763b841583faa2963a10eba9687db0b73dc51d07255cd78abd119b4aa03f9d0c5e7abe23777aef21f649565822298019f8fd58952c35265b926831466d4b9b69ad9fbd2b3958c7433199257d50ecd7888c3dbd71f422f74ca0a295e29f513ce0e0747d8e85ccca25e789fd2f84ff30340564e313ec815b78f1d123449e3e7798e936371656526edb165dd72e51fe2e53d1bbc1e7c5c14024b56ad85c908ac30b660b5fb5e40f584a5a728f3e03bd19bc6e7be5f01c1576a4a479ef78d94d84023f59b98dd316786ab71ba007c3a38cedead407bd5c0282ff6a79e67f7b86c805826056bd18dbd26de33863ded1f4cce34c3f6487e819d19207b863e84ca3f51a349a60a058517e02631d113791649228a31c66801292de279d58ccc362501974bd95a6738aed2f990a35f35777d0450743a29419c2a53d1093a0ba11730bac5e8add5858e0b292ce542bfcc83844a4af8f0d790845ff44b8a979bccb09adbc24a7d39d7495cc016a0091e8c8613d2778585d69d2b04ba8a38c71f1b349845582196e6490e082d01adeb89229548a916b7b5eee2c87dd2cdf861555c97ace421a51fed4e412a63cf7690cc2c2be0b89e6d8464289cd286e1a5a9269683f04dccea374eb294c25ac4a9dc74a43c7125754844588905c942eefe1a80252fb54d662bff23c2346735e0a4d824afba15757a0d6fb436a74b45910dff625d4064c88c14ddadaea3bb3968302fb7964b8a410ca5350042b9bb945134d434f20088eb9593056b1e2e77a3604e7a6fc37768414cbb9e50234a19d77985595ffde0b9940a527fc6cf4dced52e28e9f9ce20e871fb04892aab67195d0689577c36f6727c577028181e072742dffb078dc5e38f22b6a9c6a765f1ac1a91cc662a9bb42e96b01dcb1f61a71d7c8a999d2585225cf6f78cf5220c6ad36f0ba0dd84d60d099a996200db4707d7f9529a56704de9f62e90e2b37957e03ceb7842c3cdc29c36492032c0815ab9a377c5503122705ef98f41d4c721fb928bbafe9c32d9874d5747c23994d862b28dbc0601aec43282e7b56f07a0c078d4749d702aa805bb4d3a866263db273640af6de12bf58ae224b9f30b992f2cf9de771a9836693bc7cfad2ca8107e6a77bd5f6c66482036f5bc1efad2e1f0736148255630365e3a0553c2492fc0f8e255ca7492aa462cf82f3dc85b9e/28/1920x1080_5859480/index.m3u8'
          },
          {
            id: 'pll-network',
            name: 'PLL Network',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/22964/pll-network-ww/logo_20240626_232614_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/pll-network-ww/pll.m3u8?ads.dpname=distrotv&ads.rnd=vzfv&ads.env_i=d562135e-8b7a-474b-9866-d4336d8ed20b&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22964&ads.content_duration=18000&ads.episode_id=130883&ads.show_id=5154&ads.showCategories=IAB17&ads.episodeCategories=IAB17&ads.genre=Sports%2CLacrosse%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=PLL%20Network&ads.episodetitle=PLL%20Network&ads.keywords=Sports%2CLacrosse%2CPLL%2CPremier%20Lacrosse%20League&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=eo9wFrpfCW8'
          },
          {
            id: 'mtrspt1',
            name: 'MTRSPT1',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/23099/mtrspt1/logo_20250122_232635_70.png',
            url: 'https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg02873-kravemedia-mtrspt1-distrotv/playlist.m3u8?ads.dpname=distrotv&c_producer=Krave%20Media&dnt=0&app_bundle=&app_name=DistroTV&app_store_url=&did=&app_domain=&device_make=&device_model=&coppa=0&ads.rnd=9m3m&ads.env_i=dfdb74da-356a-48a2-9e6f-5478e09d67f3&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23099&ads.content_duration=18000&ads.episode_id=99076&ads.show_id=3489&ads.showCategories=IAB17&ads.episodeCategories=IAB17&ads.genre=Sports%2CAuto%20Racing%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=MTRSPT1&ads.episodetitle=MTRSPT1&ads.keywords=motorsports%2Cracing%2Clive%20racing%2Csports%2Csuperbike%2Cmotorcycle%2Csupercar%2Ccar&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.islive=1&ads.streamtype=live&ads.vf=zQHZKM0zA8K'
          },
          {
            id: 'motorracing',
            name: 'Motor Racing',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/22705/motorracing/logo_20231219_215946_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/motorracing/master.m3u8?ads.dpname=distrotv&ads.rnd=bwxa&ads.env_i=81060797-c152-49dd-99d7-6c94bc0e3f6a&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22705&ads.content_duration=18000&ads.episode_id=54754&ads.show_id=1714&ads.showCategories=IAB17&ads.episodeCategories=IAB17&ads.genre=Sports%2CAuto%20Racing%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=MotorRacing&ads.episodetitle=MotorRacing&ads.keywords=motorracing&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=gz8gsCq0yVe'
          },
          {
            id: 'wfnnetwork',
            name: 'WFN: World Fishing Network',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/23208/wfn-world-fishing-network/logo_20250911_182344_70.png',
            url: 'https://d3b3ldcvgsu291.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WFN/477.m3u8?ads.dpname=distrotv&ads.rnd=3ysg&ads.env_i=3869ce5c-db3e-4f6f-8357-3d1bed4726b3&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=320&ads.height=180&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23208&ads.content_duration=18000&ads.episode_id=142221&ads.show_id=5365&ads.showCategories=IAB9&ads.episodeCategories=IAB9&ads.genre=Sports%2CLifestyle%2CNature%2CReality%20TV%2CEnglish&ads.showRating=TV-PG&ads.episodeRating=TV-PG&ads.language=en&ads.showtitle=WFN%3A%20World%20Fishing%20Network&ads.episodetitle=WFN%3A%20World%20Fishing%20Network&ads.keywords=Fishing%2CAngler&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.islive=1&ads.streamtype=live&ads.vf=y45J5EaUkXW'
          },
          {
            id: 'horizonsports',
            name: 'Horizon Sports',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/22705/horizon-sports/logo_20231219_213910_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/horizon-sports/master.m3u8?ads.dpname=distrotv&ads.rnd=nzeo&ads.env_i=0046e88d-4f54-4f84-8ae7-5caa5fe3ed4e&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22705&ads.content_duration=18000&ads.episode_id=11063&ads.show_id=415&ads.showCategories=IAB17&ads.episodeCategories=IAB17&ads.genre=Sports%2CAction%2FAdventure%2CLifestyle%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Horizon%20Sports&ads.episodetitle=Horizon%20Sports&ads.keywords=horizon%20sports%2Coutdoors%2Cadventure%2Caction&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=Kso-HsJE58a'
          },
          {
            id: 'daystartv',
            name: 'Daystar TV',
            category: 'Spirituality',
            logo: 'https://a.jsrdn.com/hls/23240/daystar-tv/logo_20251209_232020_69.png',
            url: 'https://hls-live-media-gc.cdn01.net/mpegts/232076_2222904/HMX0lSsFdwYe2y3CWVtL3A/1771632000/master_mpegts.m3u8'
          },
          {
            id: 'elevationchurchnetwork',
            name: 'Elevation Church Network',
            category: 'Spirituality',
            logo: 'https://a.jsrdn.com/hls/23224/elevation-church-network/logo_20250623_165558_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/elevation-church-network/playlist.m3u8?ads.dpname=distrotv&ads.rnd=040g&ads.env_i=cf2c7d3a-55eb-4241-99f3-45e06f0d586a&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23224&ads.content_duration=18000&ads.episode_id=140685&ads.show_id=5347&ads.showCategories=IAB23&ads.episodeCategories=IAB23&ads.genre=Lifestyle%2CDevotional%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Elevation%20Church%20Network&ads.episodetitle=Elevation%20Church%20Network&ads.keywords=god%2Creligion%2Cjesus%2Celevation%20church&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=rbLrz09sccO'
          },
          {
            id: 'gusto-tv',
            name: 'Gusto TV',
            category: 'Reality',
            logo: 'https://a.jsrdn.com/hls/23062/gusto-tv/logo_20231219_202519_56.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/gusto-tv/playlist.m3u8?ads.dpname=distrotv&ads.rnd=vfer&ads.env_i=cdebc2be-caeb-4e0e-8732-67624f97d6ee&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23062&ads.content_duration=18000&ads.episode_id=83408&ads.show_id=3187&ads.showCategories=IAB8&ads.episodeCategories=IAB8&ads.genre=Lifestyle%2CFood%2CTravel%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Gusto%20TV&ads.episodetitle=Gusto%20TV&ads.keywords=Gusto%20TV%2CCooking%2CFood%2CCuisine&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=gusto&ads.islive=1&ads.streamtype=live&ads.vf=BaOY1-iQYO0'
          },
          {
            id: 'kaloopy',
            name: 'Kaloopy',
            category: '18+',
            logo: 'https://a.jsrdn.com/hls/22868/kaloopy/logo_20231219_214555_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/kaloopy/master.m3u8?ads.dpname=distrotv&ads.rnd=16e2&ads.env_i=b70a433d-116e-4d54-b610-8a27ae094f78&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22868&ads.content_duration=18000&ads.episode_id=73234&ads.show_id=1093&ads.showCategories=IAB1&ads.episodeCategories=IAB1&ads.genre=Entertainment%2CLifestyle%2CSports%2CMusic%2CGaming%2CEnglish&ads.showRating=TV-14&ads.episodeRating=TV-14&ads.language=en&ads.showtitle=Kaloopy&ads.episodetitle=Kaloopy&ads.keywords=Nascar%2Cmens%20lifestyle%2Ccall%20of%20duty%2Cgaming%2Cfitness%2Ctech%2Cmens%20fashion%2Chouse%20music%2Cmotorcycles%2Ccars%2Csoccer%2Cmotorsport%2Ctravel%2Cbeach%2Ccalifornia%2Cufc%2Cmilitary%2Csurfing%2Cskating%2Cfashion&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=R8XTvvAQP3O'
          },
          {
            id: 'wild-tv',
            name: 'Wild TV',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/23208/wild-tv/logo_20250401_215043_70.png',
            url: 'https://d1tm3cz23db55z.cloudfront.net/v1/master/9d062541f2ff39b5c0f48b743c6411d25f62fc25/DistroTV-MuxIP-WildTV/476.m3u8?ads.dpname=distrotv&ads.rnd=ib8e&ads.env_i=667dca9e-028c-4bce-bf17-15d0fe48271c&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23208&ads.content_duration=18000&ads.episode_id=139667&ads.show_id=5312&ads.showCategories=IAB9&ads.episodeCategories=IAB9&ads.genre=Lifestyle%2CNature%2COutdoors%2CHunting%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Wild%20TV&ads.episodetitle=Wild%20TV&ads.keywords=Wild%20Life%2Chunting%2Cfishing%2Cdeer%2Celk%2Cbear%2Ccoyote%2Cwhitetail%2Cturkey%2Csheep%2Cmountain%20goat%2Cwaterfowl%2Cgeese%2Cmule%20deer%2Carchery%2Cscope%2Coutdoors%2Coff%20road%2Ccamping%2Cadventure&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.islive=1&ads.streamtype=live&ads.vf=TwqcI0hRcw8'
          },
          {
            id: 'true-history',
            name: 'True History',
            category: 'Documentary',
            logo: 'https://a.jsrdn.com/hls/23001/true-history/logo_20231219_223655_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/true-history/playlist.m3u8?ads.dpname=distrotv&ads.rnd=fz0s&ads.env_i=dc6202c3-1d27-43be-8038-6bd1fc745abf&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23001&ads.content_duration=18000&ads.episode_id=66893&ads.show_id=2540&ads.showCategories=IAB5&ads.episodeCategories=IAB5&ads.genre=Education%2CInfotainment%2CDocumentary%2CHistory%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=True%20History&ads.episodetitle=True%20History&ads.keywords=True%2CHistory%2CTrue%20History&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=89drVzPzy4C'
          },
          {
            id: 'AMC',
            name: 'AMC',
            category: 'Movies',
            logo: '/channels/amc_logo.png',
            url: 'https://fl1.moveonjoy.com/AMC_NETWORK/index.m3u8'
          },
          {
            id: 'outside',
            name: 'Outside',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/22765/outside-tv/logo_20231219_220634_59.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/outsidetv/playlist.m3u8?ads.dpname=distrotv&ads.rnd=xbig&ads.env_i=75f4e5cc-91e1-4b16-9b55-2e6c1595a69e&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22765&ads.content_duration=18000&ads.episode_id=15976&ads.show_id=543&ads.showCategories=IAB17&ads.episodeCategories=IAB17&ads.genre=Sports%2CAction%2FAdventure%2CLifestyle%2CNature%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Outside&ads.episodetitle=Outside&ads.keywords=outdoors%2Coutside&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=outsidetv&ads.islive=1&ads.streamtype=live&ads.vf=khmM_SEALZu'
          },
          {
            id: 'craftsytv',
            name: 'Craftsy TV',
            category: 'Entertainment',
            logo: 'https://a.jsrdn.com/hls/23108/craftsytv/logo_20231219_192821_64.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/craftsytv/playlist.m3u8?ads.dpname=distrotv&ads.rnd=urbq&ads.env_i=ea3af02f-8fcc-4204-be18-07147fa2206f&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23108&ads.content_duration=18000&ads.episode_id=100517&ads.show_id=3570&ads.showCategories=IAB9&ads.episodeCategories=IAB9&ads.genre=Lifestyle%2CInfotainment%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=CraftsyTV&ads.episodetitle=CraftsyTV&ads.keywords=Quilting%2CKnitting%2CCrochet%2CCake%20Decorating%2CBaking%2CCooking%2CYoga%2CWoodworking%2CSlow%20TV%2CJewelry%20Making%2CPhotography%2CDrawing%2CHome%20Decor%2CPainting%2CPaper%20Crafting&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=xnFPPJhXaN0'
          },
          {
            id: 'dronetv',
            name: 'Drone TV',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/23176/dronetv/logo_20240521_191242_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/dronetv/playlist.m3u8?ads.dpname=distrotv&ads.rnd=9eig&ads.env_i=63816b71-9634-4526-9ba4-f22389399348&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23176&ads.content_duration=18000&ads.episode_id=129395&ads.show_id=5143&ads.showCategories=IAB20&ads.episodeCategories=IAB1&ads.genre=Travel%2CNature%2CLifestyle%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=DroneTV&ads.episodetitle=DroneTV&ads.keywords=drones%2Cdrone%20videos%2Cfirst%20person%20view%20drones%2Cfpv%2Cfpv%20drones%2Caerial%20cinematography%2Ctravel%20by%20drone&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=Bd3_LbEzva0'
          },
          {
            id: 'cooking-panda',
            name: 'Cooking Panda',
            category: 'Entertainment',
            logo: 'https://a.jsrdn.com/hls/22882/cooking-panda/logo_20231219_192638_68.png',
            url: 'https://api-ott-cookingpanda.ottera.tv/loggingmediaurlpassthrough/a.m3u8?ads.dpname=distrotv&version=12&id=901&partner=distro&ads.rnd=iujz&ads.env_i=bc20e538-df2b-44b9-a433-1b91c33f78d6&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=938&ads.height=528&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22882&ads.content_duration=18000&ads.episode_id=40434&ads.show_id=1210&ads.showCategories=IAB1&ads.episodeCategories=IAB1&ads.genre=Lifestyle%2CEntertainment%2CTravel%2CFood%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Cooking%20Panda&ads.episodetitle=Cooking%20Panda&ads.keywords=cooking%20panda&ads.contenturl=&ads.gdprConsent=&ads.islive=1&ads.streamtype=live&ads.vf=20260110'
          },
          {
            id: 'fuel-tv',
            name: 'Fuel TV',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/23055/fuel-tv-ww/logo_20231219_202054_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/fuel-tv-ww/playlist.m3u8?ads.dpname=distrotv&ads.rnd=flaf&ads.env_i=575c9337-87d4-41ec-9e4e-9550c55373d2&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23055&ads.content_duration=18000&ads.episode_id=81997&ads.show_id=3166&ads.showCategories=IAB17&ads.episodeCategories=IAB17&ads.genre=Sports%2CAction%2FAdventure%2CEnglish&ads.showRating=TV-PG&ads.episodeRating=TV-PG&ads.language=en&ads.showtitle=FUEL%20TV&ads.episodetitle=FUEL%20TV&ads.keywords=FUEL%20TV%2COutdoor%2CAction%2CSports%2CAction%20Sports&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=XdGvWhBrSpK'
          },
          {
            id: 'oan-plus',
            name: 'OAN Plus',
            category: 'News',
            logo: 'https://a.jsrdn.com/hls/22866/oan-encore/logo_20231219_220536_57.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/oan-encore/playlist.m3u8?ads.dpname=distrotv&ads.rnd=asec&ads.env_i=165798d3-01fd-478d-89f0-9d3da8c78d39&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22866&ads.content_duration=18000&ads.episode_id=34008&ads.show_id=1095&ads.showCategories=IAB12&ads.episodeCategories=IAB12&ads.genre=News%2CGlobal%20News%2CEnglish&ads.showRating=TV-PG&ads.episodeRating=TV-PG&ads.language=en&ads.showtitle=OAN%20Plus&ads.episodetitle=OAN%20Plus&ads.keywords=one%20america%20news%20network%2Coann%2Coan%2Cone%20america%20news&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=lYh9UEAYTcW'
          },
          {
            id: 'africa-news',
            name: 'Africa News',
            category: 'News',
            logo: 'https://a.jsrdn.com/hls/22886/africanews/logo_20231218_175639_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/africanews/africanews-en.m3u8?ads.dpname=distrotv&ads.rnd=0zvp&ads.env_i=0c25b71e-39d2-4a52-b6e7-c5b2eda71304&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22886&ads.content_duration=18000&ads.episode_id=78921&ads.show_id=3120&ads.showCategories=IAB12&ads.episodeCategories=IAB12&ads.genre=News%2CGlobal%20News%2CAfrican&ads.showRating=TV-PG&ads.episodeRating=TV-PG&ads.language=en&ads.showtitle=Africanews&ads.episodetitle=Africanews&ads.keywords=Africa%2CNews%2CAfricanews%2Cafrican&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=GQp9zyIMa8q'
          },
          {
            id: 'pickleball-now',
            name: 'Pickleball Now',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/22979/pickleball-now/logo_20260106_185156_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/pickleball-now/playlist.m3u8?ads.dpname=distrotv&ads.rnd=dhva&ads.env_i=b073c0ba-9323-4481-8340-499082eaf34e&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22979&ads.content_duration=18000&ads.episode_id=144646&ads.show_id=5387&ads.showCategories=IAB17&ads.episodeCategories=IAB17&ads.genre=Sports%2CLifestyle%2CDocumentary%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Pickleball%20Now&ads.episodetitle=Pickleball%20Now&ads.keywords=pickleball%2Cpickleball%20live%2Cpickleball%20highlights%2Cpickleball%20tv%2Cpickleball%20tournaments%2Cpickleball%20players%2Cpickleball%20interviews%2Cpickleball%20league%2Cpickleball%20training%2Cpickleball%20rules%2Cpickleball%20tips%2Cglobal%20pickleball%2Cpickleball%20matches%2Cpickleball%20now%2Cpickleball%20now%20tv&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=pb2eNpKJfSa'
          },
          {
            id: 'bowling-tv',
            name: 'Bowling TV',
            category: 'Sports',
            logo: 'https://a.jsrdn.com/hls/22964/bowling-tv/logo_20251210_204815_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/bowling-tv/bowl.m3u8?ads.dpname=distrotv&ads.rnd=r0qu&ads.env_i=a05ed00d-de6a-4523-87f5-2ab10183d328&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=22964&ads.content_duration=18000&ads.episode_id=144314&ads.show_id=5381&ads.showCategories=IAB17&ads.episodeCategories=IAB17&ads.genre=Sports%2CBowling%2CEnglish&ads.showRating=TV-G&ads.episodeRating=TV-G&ads.language=en&ads.showtitle=Bowling%20TV&ads.episodetitle=Bowling%20TV&ads.keywords=Bowling%2CStrike%2CSpare&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=m_nhoG8oCZm'
          },
          {
            id: 'wine-watches-whiskey',
            name: 'Wine Watches Whiskey',
            category: 'Entertainment',
            logo: 'https://a.jsrdn.com/hls/23241/wine-watches-whiskey/logo_20251217_201432_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/wine-watches-whiskey/index.m3u8?ads.dpname=distrotv&ads.rnd=bz7y&ads.env_i=ac33688b-161e-49fb-b469-f8adb52b4ecb&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23241&ads.content_duration=18000&ads.episode_id=144408&ads.show_id=5385&ads.showCategories=IAB9&ads.episodeCategories=IAB9&ads.genre=Lifestyle%2CCollectors%2CLuxury%2CEnglish&ads.showRating=TV-MA&ads.episodeRating=TV-MA&ads.language=en&ads.showtitle=Wine%2C%20Watches%20%26%20Whiskey&ads.episodetitle=Wine%2C%20Watches%20%26%20Whiskey&ads.keywords=Wine%2CWatches%2CWhiskey&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=zzhaQUmo7jK'
          },
          {
            id: 'rvtv',
            name: 'RVTV',
            category: 'Outdoors',
            logo: 'https://a.jsrdn.com/hls/23241/rvtv/logo_20251217_201036_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/rvtv/index.m3u8?ads.dpname=distrotv&ads.rnd=smqv&ads.env_i=692f9adf-3667-4ef5-84c4-cba92d62a45e&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23241&ads.content_duration=18000&ads.episode_id=144407&ads.show_id=5384&ads.showCategories=IAB2&ads.episodeCategories=IAB2&ads.genre=Lifestyle%2CTravel%2CAutomotive%2CEnglish&ads.showRating=TV-PG&ads.episodeRating=TV-PG&ads.language=en&ads.showtitle=RVTV&ads.episodetitle=RVTV&ads.keywords=Recreational%2CVehicle&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=oRy-XNIE3qu'
          },
          {
            id: 'daystar-espanol',
            name: 'Daystar Espanol',
            category: 'Spirituality',
            logo: 'https://a.jsrdn.com/hls/23240/daystar-espanol/logo_20251209_232554_70.png',
            url: 'https://hls-live-media-gc.cdn01.net/mpegts/232076_2222907/IHvdJRecZS4mAMfF4YzPuA/1771891200/master_mpegts.m3u8'
          },
          {
            id: 'crime-and-evidence',
            name: 'Crime and Evidence',
            category: 'Documentary',
            logo: 'https://a.jsrdn.com/hls/23181/crime-and-evidence/logo_20250818_194230_68.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/crime-and-evidence/video.m3u8?ads.dpname=distrotv&ads.rnd=2jqo&ads.env_i=233d075e-1ed3-45b9-afe5-bf3055311ffe&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23181&ads.content_duration=18000&ads.episode_id=141347&ads.show_id=5358&ads.showCategories=IAB1&ads.episodeCategories=IAB1&ads.genre=Entertainment%2CTrue%20Crime%2CDocumentary%2CEnglish&ads.showRating=TV-14&ads.episodeRating=TV-14&ads.language=en&ads.showtitle=Crime%20%26%20Evidence&ads.episodetitle=Crime%20%26%20Evidence&ads.keywords=True%20crime%2Ccriminal%20investigations%2Cforensics%2Creal%20cases%2Claw%20enforcement%2Cjustice&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=aQ6rnnT7wem'
          },
          {
            id: 'prime-asia-tv',
            name: 'Prime Asia TV',
            category: 'News',
            logo: 'https://a.jsrdn.com/hls/23215/prime-asia-tv/logo_20251125_201232_70.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/prime-asia-tv/index.m3u8?ads.dpname=distrotv&ads.rnd=lx6b&ads.env_i=f42a4c22-8af0-4b61-9f7b-1325a1f22e8e&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23215&ads.content_duration=18000&ads.episode_id=144082&ads.show_id=5378&ads.showCategories=IAB12&ads.episodeCategories=IAB12&ads.genre=News%2CCurrent%20Affairs%2CPolitics%2CAsian&ads.showRating=TV-PG&ads.episodeRating=TV-PG&ads.language=pa&ads.showtitle=Prime%20Asia%20Tv&ads.episodetitle=Prime%20Asia%20Tv&ads.keywords=Latest%20Punjabi%20News%2CPunjabi%20Language%20News%2CPunjabi%20Entertainment%20News%2CPunjabi%20News%2CPunjab%20News&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=UJIlmkJFykq'
          },
          {
            id: 'cgtn-global-biz',
            name: 'CGTN Global Biz',
            category: 'News',
            logo: 'https://a.jsrdn.com/hls/23232/cgtn-global-biz/logo_20251105_004205_68.png',
            url: 'https://amg01314-amg01314c6-distrotv-us-10220.playouts.now.amagi.tv/playlist/amg01314-cgtn-cgtnglobalbiz-distrotvus/playlist.m3u8'
          },
          {
            id: 'discovering-china',
            name: 'Discovering China',
            category: 'Documentary',
            logo: 'https://a.jsrdn.com/hls/23232/discovering-china/logo_20251105_005016_68.png',
            url: 'https://amg01314-amg01314c8-distrotv-us-10218.playouts.now.amagi.tv/playlist/amg01314-cgtn-cgtndiscoveringchina-distrotvus/playlist.m3u8'
          },
          {
            id: 'al-arabiya',
            name: 'Al Arabiya News',
            category: 'News',
            logo: 'https://a.jsrdn.com/hls/23094/cgtn/logo_20231219_185401_34.png',
            url: 'https://d35j504z0x2vu2.cloudfront.net/v1/master/0bc8e8376bd8417a1b6761138aa41c26c7309312/al-arabiya/master.m3u8?ads.dpname=distrotv&ads.rnd=3kar&ads.env_i=0374a561-79d4-4296-abe6-9da48c94a96d&ads.env_u=&ads.name=DistroTV&ads.bundle=&ads.storeurl=&ads.appCategory=entertainment&ads.app_version=202105131041&ads.width=1344&ads.height=756&ads.deviceId=&ads.deviceDNT=0&ads.gdpr=0&ads.us_privacy=0&ads.aid=&ads.deviceMake=Web&ads.deviceIdType=localStorage&ads.deviceConnectionType=2&ads.deviceCategory=web&ads.client_ip=103.107.83.132&ads.geo=PH&ads.lat=9.98920&ads.long=122.80880&ads.dma=&ads.geoType=2&ads.contentid=23137&ads.content_duration=18000&ads.episode_id=120048&ads.show_id=4924&ads.showCategories=IAB12&ads.episodeCategories=IAB12&ads.genre=News%2CRegional%20News%2CMiddle%20Eastern&ads.showRating=TV-PG&ads.episodeRating=TV-PG&ads.language=ar&ads.showtitle=Al%20Arabiya&ads.episodetitle=Al%20Arabiya&ads.keywords=Arab%2CNews&ads.contenturl=&ads.gdprConsent=&ads.paln=&ads.tagname=dtv&ads.islive=1&ads.streamtype=live&ads.vf=NDX0hcTs9qa'
          },
          // Source PH-Corner
          {
            id: 'star-movies',
            name: 'Star Movies HD',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/ms/3/37/STAR_Movies_HD_logo.jpg',
            url: 'http://103.175.242.10:8080/starmovies/index.m3u8'
          },
          {
            id: 'barely-legal',
            name: 'Barely Legal',
            category: '18+',
            logo: 'https://dcassetcdn.com/design_img/596551/203438/203438_4041728_596551_image.jpg',
            url: 'https://video.beeline.tv/live/d/channel420.isml/manifest-stb.mpd',
            licenseKey: 'bf0bdbb8a0e83ec6ba8b7f42d27a6925:f4051d1dd36e66e085264b9b342641c5'
          },
          {
            id: 'babes-tv',
            name: 'Babes TV',
            category: '18+',
            logo: 'https://www.poda.cz/wp-content/uploads/2024/04/babes-tv-2024.png',
            url: 'https://video.beeline.tv/live/d/channel472.isml/manifest-stb.mpd',
            licenseKey: '996d754bd00695c04644c3fa44c25183:5d5fcedc221c1ce858519d60442a107a'
          },
          {
            id: 'brazzers-tv-europe',
            name: 'Brazzers TV Europe',
            category: '18+',
            logo: 'https://www.cableman.ru/sites/default/files/brazzers_tv.png',
            url: 'https://video.beeline.tv/live/d/channel012.isml/manifest-stb.mpd',
            licenseKey: '30a943cb79dccfa9c2b579bb8274cf85:4e3643d08495456c936e8b77d620d496'
          },
          {
            id: 'exxxotica',
            name: 'Exxxotica',
            category: '18+',
            logo: 'https://radioimg.audacy.com/aiu-media/39d3d2937937758f30f6096a92-116186e2-0f80-4786-8d25-0c8e03281444.png?width=800',
            url: 'https://video.beeline.tv/live/d/channel442.isml/manifest-stb.mpd',
            licenseKey: '3d5bd327009443ddeee322e210dda78a:f41de33f25ffd33284a11210e8889282'
          },
          {
            id: 'french-lover',
            name: 'French Lover',
            category: '18+',
            logo: 'https://www.agsat.com.ua/wa-data/public/shop/products/86/38/3886/images/4939/4939.500-3886.jpg',
            url: 'https://video.beeline.tv/live/d/channel252.isml/manifest-stb.mpd',
            licenseKey: '2757ba26637acecfa143237f5a32e2c7:3e69642d9f9e23f0568eeb9d6a1ca48a'
          },
          {
            id: 'playboy-tv',
            name: 'Playboy TV',
            category: '18+',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Play_Boy_TV_logo_2016.svg',
            url: 'https://video.beeline.tv/live/d/channel047.isml/manifest-stb.mpd',
            licenseKey: '8b4af3cb6ba681d3df359cd404c11776:9b010f4ba2a71a3ef2706aed3549189b'
          },
          {
            id: 'red-lips',
            name: 'Red Lips',
            category: '18+',
            logo: 'https://www.cableman.ru/sites/default/files/red_lips.jpg',
            url: 'https://video.beeline.tv/live/d/channel443.isml/manifest-stb.mpd',
            licenseKey: '6fd536019350b37721cba80ef055972c:07d787ee89a0cad2d21983b4e0c792c7'
          },
          // Source Ph-Corner
          {
            id: 'action-max-east',
            name: 'Action Max HD East',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/ActionMax_logo.svg',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/iad-nitro/live/clients/dash/enc/995zvakyej/out/v1/3fa049c0afea4a83bb5f508f1859f160/cenc.mpd',
            licenseKey: '136a75130b82cdf89cb5f05d739b663f:0ef360ff75bb11b7f0982a86b86d39ae'
          },
          {
            id: 'cinemax-east',
            name: 'Cinemax HD East',
            category: 'Movies',
            logo: 'https://divign0fdw3sv.cloudfront.net/Images/ChannelLogo/contenthub/337_144.png',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/iad-nitro/live/clients/dash/enc/rckhgp0mdp/out/v1/3952b81ea31d45b38372b128371301d2/cenc.mpd',
            licenseKey: '3a5fc143bea61aa94eee0479933d5e72:8a365e8c3e2b8efdbcaab16d07c3b929'
          },
          {
            id: 'cinemax-west',
            name: 'Cinemax West',
            category: 'Movies',
            logo: 'https://divign0fdw3sv.cloudfront.net/Images/ChannelLogo/contenthub/337_144.png',
            url: 'https://a181aivottlinear-a.akamaihd.net/OTTB/iad-nitro/live/clients/dash/enc/zewdvsfpre/out/v1/d65e537877cc4112b8fd88c6210f39da/cenc.mpd',
            licenseKey: 'bf813dc4a32e0e9bcbce4446a65f4b12:eb9973b1a30c76812aa7ca8864b6a3c1'
          },
          {
            id: 'more-max-east',
            name: 'More MAX HD East',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/MoreMax_Logo.svg',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/iad-nitro/live/clients/dash/enc/bw5g1vx3k9/out/v1/6913f190498b44c8a705e91728401769/cenc.mpd',
            licenseKey: '046c374a3db594dfb32cba86d2e4f72f:04c00a6ed0fc4ce37841210a42eeeb35'
          },
          {
            id: 'more-max-west',
            name: '5StarMAX East',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/MoreMax_Logo.svg',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/iad-nitro/live/clients/dash/enc/yfo5p7nmtt/out/v1/fdce98358ffb47c9b6314feb9cfeda3f/cenc.mpd',
            licenseKey: '81a74ef0cf71e28d5d9bc55d5fd7921a:884e89f90a9f5cbaaa5c2a451e1d8f86'
          },
          {
            id: 'hbo-east',
            name: 'HBO East',
            category: 'Movies',
            logo: 'https://images.now-tv.com/shares/channelPreview/img/en_hk/color/ch115_170_122',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/iad-nitro/live/clients/dash/enc/ez2jwhkmke/out/v1/75466d737d52406e8a1c85dc70c9f183/cenc.mpd',
            licenseKey: '6ab1caa245e2d8cc4e26e0e1b63fe661:22c42d7a1679f50ca4ad37b4c1ad97fe'
          },
          {
            id: 'hbo-zone',
            name: 'HBO Zone',
            category: 'Movies',
            logo: 'https://static.wikia.nocookie.net/logopedia/images/c/cc/HBO_Zone_2000.svg',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/iad-nitro/live/clients/dash/enc/u7xfabrc5b/out/v1/67371e988d6649afbde43ba1e9747550/cenc.mpd',
            licenseKey: '0b380bec87af5c16ee145bbf8cd7d65e:edcb65d1269bd76f166d6bc56114211f'
          },
          {
            id: 'hbo-comedy',
            name: 'HBO Comedy',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/8/84/HBO_Comedy_logo.png',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/iad-nitro/live/clients/dash/enc/f6ns8qsqde/out/v1/0827e077a8224107a1e6137627cc8198/cenc.mpd',
            licenseKey: '217624a3983b3593ca7d1f3b01042d4f:fecaa3486d9deef3f7f0e1a95b662cb7'
          },
          {
            id: 'hbo-west',
            name: 'HBO West',
            category: 'Movies',
            logo: 'https://images.now-tv.com/shares/channelPreview/img/en_hk/color/ch115_170_122',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/iad-nitro/live/clients/dash/enc/zzhnlvao6q/out/v1/66f60c1d629549a78a22cc2913bfb3d1/cenc.mpd',
            licenseKey: '266fed45577cd293af39165e8073bc19:8e805607852c0606ecc553bd234d78b2'
          },
          {
            id: 'reelz',
            name: 'REELZ Channel',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/en/b/b1/Reelz_Channel_Logo.png',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/IAD/clients/dash/enc/dhdemvb6ff/out/v1/2dbabadc0d204aa9aad2c2e5d29af5c0/cenc.mpd',
            licenseKey: '2312fd39721560ea14f98caf3464195e:93713bb73be2d8aedf3eeb898850e7d5'
          },
          {
            id: 'screenpix-action',
            name: 'Screenpix Action',
            category: 'Movies',
            logo: 'https://static.wikia.nocookie.net/logopedia/images/2/27/ScreenPix_Action.png',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/PDX/clients/dash/enc/2bsytxoitz/out/v1/312e6d1e20e744c0a9bf25519f6da91b/cenc.mpd',
            licenseKey: 'a340ce5a22ce1a5f54c2c5dd18e8fe7d:afa091d637e61d585ad036fd4b8a3235'
          },
          {
            id: 'screenpix-westerns',
            name: 'Screenpix Westerns',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/ScreenPix_Logo_2019.png',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/PDX/clients/dash/enc/ikqumnhhew/out/v1/1f50afbc65ba48e79f8325022bdb72a0/cenc.mpd',
            licenseKey: '429d2a8c13dc9a40a13ef8d4e2325209:631892e5f5451b5596528e194c44d95b'
          },
          {
            id: 'screenpix',
            name: 'Screenpix',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/ScreenPix_Logo_2019.png',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/PDX/clients/dash/enc/9lvpst0mpb/out/v1/ba33b946c96e4a60886e2d91156398cd/cenc.mpd',
            licenseKey: '537cc6cb07fe4bcc63d06c3018d5e35c:7420e0237883a05e4d2ddafaf114b050'
          },
          {
            id: 'mgm-drive-in',
            name: 'MGM Drive-in',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f3/MGM%2B_Drive-In_2023.svg',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/pdx-nitro/live/clients/dash/enc/ijf9c1nj9l/out/v1/d8018bfb87ac4be1840dbc18b31f2fed/cenc.mpd',
            licenseKey: '0b74cf4e95c3dac51f8445d044d5fa11:abe32ddf4ab8e451b505354d55629785'
          },
          {
            id: 'mgm-hits',
            name: 'MGM Hits',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/2/28/MGM%2B_Hits_2023.svg',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/pdx-nitro/live/clients/dash/enc/6twfogu6go/out/v1/fe3c6ff9c8d94b2187e2e87b4edacca8/cenc.mpd',
            licenseKey: '563740ab2942d108384539e507d268a3:fb51835b952fab5a9d5233c771da1d3d'
          },
          {
            id: 'mgm-marquee',
            name: 'MGM Marquee',
            category: 'Movies',
            logo: 'http://upload.wikimedia.org/wikipedia/commons/4/41/MGM%2B_Marquee_2023.svg',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/pdx-nitro/live/clients/dash/enc/y7rqqxcdk4/out/v1/fb99f1f5705d4f3194e9a234ef717bd5/cenc.mpd',
            licenseKey: 'edec01accce094e2e105f76a8fac1a48:0c536390abb52439b4cac20bfe96daea'
          },
          {
            id: 'mgm-plus',
            name: 'MGM+',
            category: 'Movies',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/4/49/MGM%2B_logo.svg',
            url: 'https://ottb.live.cf.ww.aiv-cdn.net/pdx-nitro/live/clients/dash/enc/ck8h9qqlfr/out/v1/34a373fb214d4e1590a3ab397b2d7af1/cenc.mpd',
            licenseKey: 'ea46cd84fc0fcaefc45b5d1d9b977db4:715a77d80b090e9f964e3616ca9e66d2'
          },
          {
            id: 'tudn',
            name: 'TUDN',
            category: 'Sports',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/TUDN_Logo.svg',
            url: 'https://zap-live1-ott.izzigo.tv/11/out/u/dash/TUDN-HD/default.mpd',
            licenseKey: '2722647f77b44824c432a3c4555830a2:1734befb82f4b438bd84195f6c212e7b'
          }

        ];

        // Excluded Channels
        const excludedIds = [0];
        const filteredParsed = parsed.filter(ch => !excludedIds.includes(ch.id));

        const allChannels = [...manualChannels, ...filteredParsed];
        allChannels.sort((a, b) => a.name.localeCompare(b.name));
        setChannels(allChannels);
      } catch (err) {
        console.error('Error fetching IPTV playlist:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylist();
  }, []);

  // Filter channels by search and status
  const filteredChannels = useMemo(() => {
    return channels.filter((channel) => {
      const matchesSearch = channel.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      const isOffline = offlineChannels.includes(channel.id);

      const matchesCategory = categoryFilter === 'All'
        ? !isOffline // 'All' excludes offline channels
        : categoryFilter === 'Favorites'
          ? favorites.includes(channel.id)
          : categoryFilter === 'Offline'
            ? isOffline
            : (channel.category || 'Entertainment') === categoryFilter && !isOffline;

      return matchesSearch && matchesCategory;
    });
  }, [channels, searchQuery, categoryFilter, favorites, offlineChannels]);

  // key categories Entertainment, Movies, News, Sports, Kids, Documentary, and Pinoy
  const categories = ['18+', 'Entertainment', 'Movies', 'News', 'Sports', 'Kids', 'Documentary', 'Outdoors', 'Reality', 'Music', 'Spirituality', 'Pinoy', 'Offline'];

  const getCategoryCount = (cat) => {
    if (cat === 'Favorites') return favorites.length;
    if (cat === 'Offline') return offlineChannels.length;
    return channels.filter(c => (c.category || 'Entertainment') === cat && !offlineChannels.includes(c.id)).length;
  };

  // Count live and offline
  const liveCount = channels.length - offlineChannels.length;
  const offlineCount = offlineChannels.length;

  const handleChannelClick = (channel) => {
    const channelIndex = filteredChannels.findIndex(c => c.id === channel.id);
    navigate(`/iptv/watch/${channel.id}`, {
      state: { channel, channels: filteredChannels, channelIndex },
    });
  };

  const handleMarkLive = (e, channelId) => {
    e.stopPropagation();
    const updated = offlineChannels.filter(id => id !== channelId);
    setOfflineChannels(updated);
    saveOfflineChannels(updated);
  };

  const toggleFavorite = (e, channelId) => {
    e.stopPropagation();
    let updated;
    if (favorites.includes(channelId)) {
      updated = favorites.filter(id => id !== channelId);
    } else {
      updated = [...favorites, channelId];
    }
    setFavorites(updated);
    saveFavorites(updated);
  };

  // Drag to scroll logic for Top 10 list
  const gridRef = useRef(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Custom Dropdown Logic
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Momentum state
  const velX = useRef(0);
  const animationFrameId = useRef(null);
  const lastMouseMoveTime = useRef(0);

  const cancelMomentum = () => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
  };

  const momentumLoop = () => {
    if (!gridRef.current) return;

    // Apply velocity
    gridRef.current.scrollLeft -= velX.current;

    // Decay velocity
    velX.current *= 0.95; // Friction factor

    if (Math.abs(velX.current) > 0.5) {
      animationFrameId.current = requestAnimationFrame(momentumLoop);
    } else {
      animationFrameId.current = null;
    }
  };

  const handleMouseDown = (e) => {
    setIsDown(true);
    setIsDragging(false);
    cancelMomentum();

    setStartX(e.pageX - gridRef.current.offsetLeft);
    setScrollLeft(gridRef.current.scrollLeft);
    velX.current = 0;

    gridRef.current.style.cursor = 'grabbing';
  };

  const handleMouseLeave = () => {
    setIsDown(false);
    if (gridRef.current) gridRef.current.style.cursor = 'grab';
    // Start momentum if velocity is present
    if (Math.abs(velX.current) > 1) {
      cancelMomentum();
      animationFrameId.current = requestAnimationFrame(momentumLoop);
    }
  };

  const handleMouseUp = () => {
    setIsDown(false);
    if (gridRef.current) gridRef.current.style.cursor = 'grab';
    setTimeout(() => setIsDragging(false), 0);

    // Start momentum if velocity is present
    if (Math.abs(velX.current) > 1) {
      cancelMomentum();
      animationFrameId.current = requestAnimationFrame(momentumLoop);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDown) return;
    e.preventDefault();

    const x = e.pageX - gridRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll-fast factor
    const prevScrollLeft = gridRef.current.scrollLeft;

    // Calculate velocity
    const now = Date.now();
    lastMouseMoveTime.current = now;

    velX.current = (e.movementX) * 2;

    gridRef.current.scrollLeft = scrollLeft - walk;

    if (Math.abs(x - startX) > 5) {
      setIsDragging(true);
    }
  };

  if (loading) {
    return (
      <div className="iptv-page">
        <div className="iptv-loading">
          <div className="loading-spinner"></div>
          <p>Loading channels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="iptv-page">
        <div className="iptv-error">
          <h2>Failed to load channels</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="iptv-page">
      <div className="iptv-header">
        <h1>Live TV</h1>
        <p className="iptv-subtitle">{channels.length} channels available</p>
        <p className="iptv-description">
          Your destination for live TV. Enjoy news, sports, and entertainment on demand with a fresh, diverse lineup of channels at your fingertips.
        </p>
      </div>

      {/* Top 10 Live TV Channels */}
      <section className="iptv-top10-section">
        <div className="iptv-top10-header">Recommended Channels</div>
        <div
          className="iptv-top10-list"
          ref={gridRef}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeave}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
        >
          {[
            { rank: 1, name: 'Kapamilya Channel', logo: 'https://static.wikia.nocookie.net/abscbn/images/7/74/Kapamilya_Channel_3D_Logo.png', channelId: 95 },
            { rank: 2, name: 'GMA7', logo: 'https://static.wikia.nocookie.net/logopedia/images/a/aa/GMA_Network_2024_logo.png', channelId: 'gma7' },
            { rank: 3, name: 'Star Movies', logo: 'https://upload.wikimedia.org/wikipedia/ms/3/37/STAR_Movies_HD_logo.jpg', channelId: 'star-movies' },
            { rank: 4, name: 'One Sports', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/One_Sports_logo.svg/1200px-One_Sports_logo.svg.png', channelId: 64 },
            { rank: 5, name: 'Cinema One', logo: 'https://upload.wikimedia.org/wikipedia/en/6/6d/Cinema_One_2013_logo.svg', channelId: 'cinema-one' },
            { rank: 6, name: 'HBO', logo: 'https://upload.wikimedia.org/wikipedia/commons/d/de/HBO_logo.svg', channelId: 80 },
            { rank: 7, name: 'Cinemax', logo: 'https://logodix.com/logo/2138572.png', channelId: 103 },
            { rank: 8, name: 'CNN International', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/CNN.svg', channelId: 81 },
            { rank: 9, name: 'AMC+', logo: 'https://shop.amc.com/cdn/shop/products/AMCP-LOGO-100011-FR-RO_1500x.png', channelId: 'amc-plus' },
            { rank: 10, name: 'Nickelodeon', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2009_logo.svg/1280px-Nickelodeon_2009_logo.svg.png', channelId: 71 },
            { rank: 11, name: 'Animal Planet', logo: 'https://wildaid.org/wp-content/uploads/2021/08/animal-planet-logo-white.png', channelId: 59 },
            { rank: 12, name: 'Warner TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Warner2018LA.png', channelId: 97 },
          ].map(item => {
            const channel = channels.find(c => c.id === item.channelId);
            return (
              <div
                key={item.rank}
                className="iptv-top10-item"
                onClick={() => !isDragging && channel && handleChannelClick(channel)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && channel && handleChannelClick(channel)}
                role="button"
                tabIndex={0}
                aria-label={`Rank ${item.rank}: ${item.name}`}
                style={{ cursor: channel ? 'pointer' : 'default' }}
              >
                <span className="iptv-top10-rank">{item.rank}</span>
                <div className="iptv-top10-logo-container">
                  <img src={item.logo} alt={item.name} className="iptv-top10-logo" loading="lazy" draggable="false" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Favorites Section */}
      {(() => {
        const favoriteChannels = favorites
          .map(favId => channels.find(c => c.id === favId))
          .filter(Boolean);

        if (favoriteChannels.length === 0) return null;

        return (
          <section className="iptv-favorites-section">
            <div className="iptv-top10-header">Favorites</div>
            <div
              className="iptv-favorites-list"
              onMouseDown={(e) => {
                const el = e.currentTarget;
                el._isDown = true;
                el._isDragging = false;
                el._startX = e.pageX - el.offsetLeft;
                el._scrollLeft = el.scrollLeft;
                el.style.cursor = 'grabbing';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el._isDown = false;
                el.style.cursor = 'grab';
              }}
              onMouseUp={(e) => {
                const el = e.currentTarget;
                el._isDown = false;
                el.style.cursor = 'grab';
                setTimeout(() => { el._isDragging = false; }, 0);
              }}
              onMouseMove={(e) => {
                const el = e.currentTarget;
                if (!el._isDown) return;
                e.preventDefault();
                const x = e.pageX - el.offsetLeft;
                const walk = (x - el._startX) * 2;
                el.scrollLeft = el._scrollLeft - walk;
                if (Math.abs(x - el._startX) > 5) el._isDragging = true;
              }}
            >
              {favoriteChannels.map(channel => (
                <div
                  key={channel.id}
                  className="iptv-favorites-item"
                  onClick={(e) => {
                    if (e.currentTarget.parentElement._isDragging) return;
                    handleChannelClick(channel);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleChannelClick(channel)}
                  aria-label={`Favorite: ${channel.name}`}
                >
                  <div className="iptv-top10-logo-container">
                    <img src={channel.logo} alt={channel.name} className="iptv-top10-logo" loading="lazy" draggable="false" />
                  </div>
                  <span className="iptv-favorites-name">{channel.name}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      <div className="iptv-filters">
        <div className="iptv-search-container">
          <svg
            className="iptv-search-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="iptv-search-input"
            placeholder="Search TV Channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Custom Dropdown */}
        <div className="iptv-custom-select-container" ref={dropdownRef}>
          <div
            className={`iptv-custom-select-trigger ${isDropdownOpen ? 'open' : ''}`}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsDropdownOpen(!isDropdownOpen)}
          >
            <span>
              {categoryFilter === 'All'
                ? `All (${channels.length})`
                : `${categoryFilter} (${getCategoryCount(categoryFilter)})`}
            </span>
            <svg
              className={`iptv-select-arrow ${isDropdownOpen ? 'open' : ''}`}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          {isDropdownOpen && (
            <div className="iptv-custom-options">
              <div
                className={`iptv-custom-option ${categoryFilter === 'All' ? 'selected' : ''}`}
                onClick={() => {
                  setCategoryFilter('All');
                  setIsDropdownOpen(false);
                }}
              >
                All ({channels.length})
                {categoryFilter === 'All' && <span className="check-mark">✓</span>}
              </div>
              {categories.map(cat => (
                <div
                  key={cat}
                  className={`iptv-custom-option ${categoryFilter === cat ? 'selected' : ''}`}
                  onClick={() => {
                    setCategoryFilter(cat);
                    setIsDropdownOpen(false);
                  }}
                >
                  {cat} ({getCategoryCount(cat)})
                  {categoryFilter === cat && <span className="check-mark">✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="iptv-grid">
        {filteredChannels.map((channel) => {
          const isOffline = offlineChannels.includes(channel.id);
          return (
            <div
              key={channel.id}
              className={`iptv-channel-card${isOffline ? ' iptv-channel-offline' : ''}`}
              onClick={() => handleChannelClick(channel)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleChannelClick(channel)}
            >
              <button
                className={`iptv-favorite-btn ${favorites.includes(channel.id) ? 'active' : ''}`}
                onClick={(e) => toggleFavorite(e, channel.id)}
                title={favorites.includes(channel.id) ? "Remove from Favorites" : "Add to Favorites"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill={favorites.includes(channel.id) ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-star"
                >
                  <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path>
                </svg>
              </button>

              {isOffline && (
                <button
                  className="iptv-mark-live-btn"
                  onClick={(e) => handleMarkLive(e, channel.id)}
                  title="Mark as Live"
                >
                  ↻
                </button>
              )}
              <div className="iptv-channel-logo-container">
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt={channel.name}
                    className="iptv-channel-logo"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="iptv-channel-logo-fallback"
                  style={{ display: channel.logo ? 'none' : 'flex' }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z" />
                  </svg>
                </div>
              </div>
              <div className="iptv-channel-info">
                <h3 className="iptv-channel-name">{channel.name}</h3>
              </div>
            </div>
          );
        })}
      </div>

      {
        filteredChannels.length === 0 && (
          <div className="iptv-no-results">
            <p>No channels found matching your criteria</p>
          </div>
        )
      }
    </div >
  );
};

export default IPTV;