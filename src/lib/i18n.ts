import React, { useState, useEffect } from 'react';

export type SupportedLanguage = 
  | 'en-US'
  | 'en-GB'
  | 'sw'
  | 'zh'
  | 'hi'
  | 'ar'
  | 'fr'
  | 'es'
  | 'pt'
  | 'de'
  | 'tr'
  | 'ja'
  | 'ko';

export type LanguageCode = SupportedLanguage;

export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  isRtl: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en-US', name: 'English (US)', nativeName: 'English (US)', flag: '🇺🇸', isRtl: false },
  { code: 'en-GB', name: 'English (UK)', nativeName: 'English (UK)', flag: '🇬🇧', isRtl: false },
  { code: 'sw', name: 'Kiswahili', nativeName: 'Kiswahili', flag: '🇹🇿', isRtl: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文 (简体)', flag: '🇨🇳', isRtl: false },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', isRtl: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', isRtl: true },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', isRtl: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', isRtl: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', isRtl: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', isRtl: false },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', isRtl: false },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', isRtl: false },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', isRtl: false },
];

export const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  'en-US': {
    home: 'Home',
    movies: 'Movies',
    series: 'Series',
    trending: 'Trending',
    watchlist: 'My List',
    myList: 'My List',
    nav_home: 'Home',
    nav_movies: 'Movies',
    nav_series: 'Series',
    nav_trending: 'Trending',
    nav_watchlist: 'My List',
    nav_search: 'Search',
    nav_vip: 'VIP',
    premium: 'Premium',
    admin: 'Admin CMS',
    search: 'Search',
    notifications: 'Notifications',
    language: 'Language',
    settings: 'Settings',
    profile: 'Profile',
    signInWithPi: 'Sign in with Pi',
    signOut: 'Sign Out',
    switchLogOut: 'Switch / Log out',
    play: 'Play',
    watchNow: 'Watch Now',
    viewSeasons: 'View Seasons',
    allSeasons: 'All Seasons',
    seasons: 'Seasons',
    episodes: 'Episodes',
    episode: 'Episode',
    addToWatchlist: 'Add to Watchlist',
    inWatchlist: 'In Watchlist',
    like: 'Like',
    liked: 'Liked',
    share: 'Share',
    free: 'Free',
    freeTier: 'Free Tier',
    vipSubscriber: 'VIP Subscriber',
    upgradeWithPi: 'Upgrade with Pi',
    myWatchlistHistory: 'My Watchlist & History',
    searchPlaceholder: 'Search movies, TV series, actors, directors...',
    realVisitorAnalytics: 'Real Visitor Analytics',
    quality: 'Quality',
    duration: 'Duration',
    reviews: 'Reviews',
    rating: 'Rating',
    cast: 'Cast',
    director: 'Director',
    genre: 'Genre',
    year: 'Year',
    addEpisode: 'Add Episode',
    addSeason: 'Add Season',
    seasonNameNumber: 'Season Name / Number',
    batchUpload: 'Batch Upload Videos',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    loading: 'Loading...',
    minutes: 'mins',
    noEpisodesFound: 'No episodes found for this season.',
    continueWatching: 'Continue Watching',
    featuredNow: 'Featured on PiFlix+'
  },
  'en-GB': {
    home: 'Home',
    movies: 'Movies',
    series: 'Series',
    trending: 'Trending',
    watchlist: 'My List',
    myList: 'My List',
    nav_home: 'Home',
    nav_movies: 'Movies',
    nav_series: 'Series',
    nav_trending: 'Trending',
    nav_watchlist: 'My List',
    nav_search: 'Search',
    nav_vip: 'VIP',
    premium: 'Premium',
    admin: 'Admin CMS',
    search: 'Search',
    notifications: 'Notifications',
    language: 'Language',
    settings: 'Settings',
    profile: 'Profile',
    signInWithPi: 'Sign in with Pi',
    signOut: 'Sign Out',
    switchLogOut: 'Switch / Log out',
    play: 'Play',
    watchNow: 'Watch Now',
    viewSeasons: 'View Seasons',
    allSeasons: 'All Seasons',
    seasons: 'Seasons',
    episodes: 'Episodes',
    episode: 'Episode',
    addToWatchlist: 'Add to Watchlist',
    inWatchlist: 'In Watchlist',
    like: 'Like',
    liked: 'Liked',
    share: 'Share',
    free: 'Free',
    freeTier: 'Free Tier',
    vipSubscriber: 'VIP Subscriber',
    upgradeWithPi: 'Upgrade with Pi',
    myWatchlistHistory: 'My Watchlist & History',
    searchPlaceholder: 'Search films, TV series, cast, directors...',
    realVisitorAnalytics: 'Real Visitor Analytics',
    quality: 'Quality',
    duration: 'Duration',
    reviews: 'Reviews',
    rating: 'Rating',
    cast: 'Cast',
    director: 'Director',
    genre: 'Genre',
    year: 'Year',
    addEpisode: 'Add Episode',
    addSeason: 'Add Season',
    seasonNameNumber: 'Season Name / Number',
    batchUpload: 'Batch Upload Videos',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    loading: 'Loading...',
    minutes: 'mins',
    noEpisodesFound: 'No episodes found for this season.',
    continueWatching: 'Continue Watching',
    featuredNow: 'Featured on PiFlix+'
  },
  'sw': {
    home: 'Mwanzo',
    movies: 'Filamu',
    series: 'Vipindi vya Runinga',
    trending: 'Zinazovuma',
    watchlist: 'Orodha Yangu',
    premium: 'Premium VIP',
    admin: 'Usimamizi wa Tovuti',
    search: 'Tafuta',
    notifications: 'Arifa',
    language: 'Lugha',
    settings: 'Mipangilio',
    profile: 'Wasifu',
    signInWithPi: 'Ingia kwa Pi Network',
    signOut: 'Toka',
    switchLogOut: 'Badilisha / Toka',
    play: 'Cheza',
    watchNow: 'Tazama Sasa',
    viewSeasons: 'Tazama Misimu',
    allSeasons: 'Misimu Yote',
    seasons: 'Misimu',
    episodes: 'Vipindi',
    episode: 'Kipindi',
    addToWatchlist: 'Weka kwenye Orodha',
    inWatchlist: 'Kwenye Orodha',
    like: 'Penda',
    liked: 'Imependwa',
    share: 'Shiriki',
    free: 'Bure',
    freeTier: 'Kifurushi cha Bure',
    vipSubscriber: 'Mwanachama wa VIP',
    upgradeWithPi: 'Jiunge na Pi',
    myWatchlistHistory: 'Orodha Yangu na Historia',
    searchPlaceholder: 'Tafuta filamu, vipindi, waigizaji...',
    realVisitorAnalytics: 'Takwimu Halisi za Wageni',
    quality: 'Ubora',
    duration: 'Muda',
    reviews: 'Maoni',
    rating: 'Kiwango',
    cast: 'Waigizaji',
    director: 'Mwongozaji',
    genre: 'Aina',
    year: 'Mwaka',
    addEpisode: 'Ongeza Kipindi',
    addSeason: 'Ongeza Msimu',
    seasonNameNumber: 'Jina / Nambari ya Msimu',
    batchUpload: 'Pakia Video Nyingi',
    saveChanges: 'Hifadhi Mabadiliko',
    cancel: 'Ghairi',
    loading: 'Inapakia...',
    minutes: 'dakika',
    noEpisodesFound: 'Hakuna vipindi vilivyopatikana kwa msimu huu.',
    continueWatching: 'Endelea Kutazama',
    featuredNow: 'Imeangaziwa kwenye PiFlix+'
  },
  'zh': {
    home: '首页',
    movies: '电影',
    series: '电视剧',
    trending: '热门榜单',
    watchlist: '我的片单',
    premium: '尊享会员',
    admin: '管理后台',
    search: '搜索',
    notifications: '系统通知',
    language: '语言设置',
    settings: '系统设置',
    profile: '个人中心',
    signInWithPi: '通过 Pi Network 登录',
    signOut: '退出登录',
    switchLogOut: '切换账号 / 退出',
    play: '播放',
    watchNow: '立即观看',
    viewSeasons: '查看各季',
    allSeasons: '全部剧季',
    seasons: '剧季',
    episodes: '剧集',
    episode: '第 {num} 集',
    addToWatchlist: '加入片单',
    inWatchlist: '已在片单',
    like: '点赞',
    liked: '已点赞',
    share: '分享',
    free: '免费',
    freeTier: '普通用户',
    vipSubscriber: 'VIP 尊享会员',
    upgradeWithPi: '使用 Pi 币升级会员',
    myWatchlistHistory: '我的片单与播放历史',
    searchPlaceholder: '搜索电影、电视剧、演员、导演...',
    realVisitorAnalytics: '实时访客数据统计',
    quality: '画质',
    duration: '时长',
    reviews: '用户评价',
    rating: '评分',
    cast: '演员阵容',
    director: '导演',
    genre: '类型',
    year: '年份',
    addEpisode: '添加单集',
    addSeason: '添加新季',
    seasonNameNumber: '剧季名称 / 编号',
    batchUpload: '批量上传视频',
    saveChanges: '保存更改',
    cancel: '取消',
    loading: '加载中...',
    minutes: '分钟',
    noEpisodesFound: '该剧季暂无剧集。',
    continueWatching: '继续播放',
    featuredNow: 'PiFlix+ 精选推荐'
  },
  'hi': {
    home: 'होम',
    movies: 'फिल्में',
    series: 'टीवी सीरीज',
    trending: 'ट्रेंडिंग',
    watchlist: 'मेरी वॉचलिस्ट',
    premium: 'प्रीमियम वीआईपी',
    admin: 'एडमिन पैनल',
    search: 'खोजें',
    notifications: 'सूचनाएं',
    language: 'भाषा',
    settings: 'सेटिंग्स',
    profile: 'प्रोफाइल',
    signInWithPi: 'Pi Network से साइन इन करें',
    signOut: 'साइन आउट',
    switchLogOut: 'स्विच / लॉग आउट',
    play: 'चलाएं',
    watchNow: 'अभी देखें',
    viewSeasons: 'सीज़न देखें',
    allSeasons: 'सभी सीज़न',
    seasons: 'सीज़न',
    episodes: 'एपिसोड',
    episode: 'एपिसोड',
    addToWatchlist: 'वॉचलिस्ट में जोड़ें',
    inWatchlist: 'वॉचलिस्ट में है',
    like: 'पसंद करें',
    liked: 'पसंद किया गया',
    share: 'शेयर करें',
    free: 'मुफ्त',
    freeTier: 'फ्री टियर',
    vipSubscriber: 'वीआईपी सब्सक्राइबर',
    upgradeWithPi: 'Pi से अपग्रेड करें',
    myWatchlistHistory: 'मेरी वॉचलिस्ट और इतिहास',
    searchPlaceholder: 'फिल्में, टीवी श्रृंखला, अभिनेता खोजें...',
    realVisitorAnalytics: 'वास्तविक विज़िटर एनालिटिक्स',
    quality: 'गुणवत्ता',
    duration: 'अवधि',
    reviews: 'समीक्षाएं',
    rating: 'रेटिंग',
    cast: 'कलाकार',
    director: 'निर्देशक',
    genre: 'शैली',
    year: 'वर्ष',
    addEpisode: 'एपिसोड जोड़ें',
    addSeason: 'सीज़न जोड़ें',
    seasonNameNumber: 'सीज़न का नाम / संख्या',
    batchUpload: 'बैच वीडियो अपलोड',
    saveChanges: 'बदलाव सहेजें',
    cancel: 'रद्द करें',
    loading: 'लोड हो रहा है...',
    minutes: 'मिनट',
    noEpisodesFound: 'इस सीज़न के लिए कोई एपिसोड नहीं मिला।',
    continueWatching: 'देखना जारी रखें',
    featuredNow: 'PiFlix+ पर खास'
  },
  'ar': {
    home: 'الرئيسية',
    movies: 'الأفلام',
    series: 'المسلسلات',
    trending: 'الشائع الآن',
    watchlist: 'قائمتي',
    premium: 'بريميوم VIP',
    admin: 'لوحة الإدارة',
    search: 'بحث',
    notifications: 'الإشعارات',
    language: 'اللغة',
    settings: 'الإعدادات',
    profile: 'الملف الشخصي',
    signInWithPi: 'تسجيل الدخول عبر باي',
    signOut: 'تسجيل الخروج',
    switchLogOut: 'تبديل / خروج',
    play: 'تشغيل',
    watchNow: 'شاهد الآن',
    viewSeasons: 'عرض المواسم',
    allSeasons: 'جميع المواسم',
    seasons: 'المواسم',
    episodes: 'الحلقات',
    episode: 'حلقة',
    addToWatchlist: 'إضافة للقائمة',
    inWatchlist: 'في القائمة',
    like: 'إعجاب',
    liked: 'تم الإعجاب',
    share: 'مشاركة',
    free: 'مجاني',
    freeTier: 'حساب مجاني',
    vipSubscriber: 'مشترك VIP',
    upgradeWithPi: 'الترقية بواسطة Pi',
    myWatchlistHistory: 'قائمتي وسجل المشاهدة',
    searchPlaceholder: 'ابحث عن أفلام، مسلسلات، ممثلين، مخرجين...',
    realVisitorAnalytics: 'تحليلات الزوار الحقيقيين',
    quality: 'الجودة',
    duration: 'المدة',
    reviews: 'التقييمات والمراجعات',
    rating: 'التقييم',
    cast: 'طاقم العمل',
    director: 'المخرج',
    genre: 'التصنيف',
    year: 'السنة',
    addEpisode: 'إضافة حلقة',
    addSeason: 'إضافة موسم',
    seasonNameNumber: 'اسم / رقم الموسم',
    batchUpload: 'رفع فيديوهات متعددة',
    saveChanges: 'حفظ التغييرات',
    cancel: 'إلغاء',
    loading: 'جار التحميل...',
    minutes: 'دقيقة',
    noEpisodesFound: 'لا توجد حلقات لهذا الموسم حالياً.',
    continueWatching: 'متابعة المشاهدة',
    featuredNow: 'مميز على PiFlix+'
  },
  'fr': {
    home: 'Accueil',
    movies: 'Movies',
    series: 'Series',
    trending: 'Tendances',
    watchlist: 'Ma Liste',
    premium: 'Premium VIP',
    admin: 'Administration',
    search: 'Recherche',
    notifications: 'Notifications',
    language: 'Langue',
    settings: 'Paramètres',
    profile: 'Profil',
    signInWithPi: 'Connexion avec Pi Network',
    signOut: 'Se déconnecter',
    switchLogOut: 'Changer de compte / Déconnexion',
    play: 'Lire',
    watchNow: 'Regarder maintenant',
    viewSeasons: 'Voir les Saisons',
    allSeasons: 'Toutes les Saisons',
    seasons: 'Saisons',
    episodes: 'Épisodes',
    episode: 'Épisode',
    addToWatchlist: 'Ajouter à ma liste',
    inWatchlist: 'Dans ma liste',
    like: 'J\'aime',
    liked: 'Aimé',
    share: 'Partager',
    free: 'Gratuit',
    freeTier: 'Compte Gratuit',
    vipSubscriber: 'Abonné VIP',
    upgradeWithPi: 'Passer VIP avec Pi',
    myWatchlistHistory: 'Ma Liste & Historique',
    searchPlaceholder: 'Rechercher films, séries, acteurs, réalisateurs...',
    realVisitorAnalytics: 'Statistiques Réelles des Visiteurs',
    quality: 'Qualité',
    duration: 'Durée',
    reviews: 'Avis et Critiques',
    rating: 'Note',
    cast: 'Distribution',
    director: 'Réalisateur',
    genre: 'Genre',
    year: 'Année',
    addEpisode: 'Ajouter un Épisode',
    addSeason: 'Ajouter une Saison',
    seasonNameNumber: 'Nom / Numéro de la Saison',
    batchUpload: 'Téléverser plusieurs vidéos',
    saveChanges: 'Enregistrer',
    cancel: 'Annuler',
    loading: 'Chargement...',
    minutes: 'min',
    noEpisodesFound: 'Aucun épisode trouvé pour cette saison.',
    continueWatching: 'Reprendre la lecture',
    featuredNow: 'À l\'affiche sur PiFlix+'
  },
  'es': {
    home: 'Inicio',
    movies: 'Películas',
    series: 'Series de TV',
    trending: 'Tendencias',
    watchlist: 'Mi Lista',
    premium: 'Premium VIP',
    admin: 'Panel Admin',
    search: 'Buscar',
    notifications: 'Notificaciones',
    language: 'Idioma',
    settings: 'Ajustes',
    profile: 'Perfil',
    signInWithPi: 'Iniciar sesión con Pi',
    signOut: 'Cerrar sesión',
    switchLogOut: 'Cambiar de cuenta / Salir',
    play: 'Reproducir',
    watchNow: 'Ver ahora',
    viewSeasons: 'Ver Temporadas',
    allSeasons: 'Todas las Temporadas',
    seasons: 'Temporadas',
    episodes: 'Episodios',
    episode: 'Episodio',
    addToWatchlist: 'Añadir a mi lista',
    inWatchlist: 'En mi lista',
    like: 'Me gusta',
    liked: 'Te gusta',
    share: 'Compartir',
    free: 'Gratis',
    freeTier: 'Nivel Gratuito',
    vipSubscriber: 'Suscriptor VIP',
    upgradeWithPi: 'Mejorar con Pi',
    myWatchlistHistory: 'Mi Lista e Historial',
    searchPlaceholder: 'Buscar películas, series, actores, directores...',
    realVisitorAnalytics: 'Analítica Real de Visitantes',
    quality: 'Calidad',
    duration: 'Duración',
    reviews: 'Reseñas',
    rating: 'Calificación',
    cast: 'Reparto',
    director: 'Director',
    genre: 'Género',
    year: 'Año',
    addEpisode: 'Añadir Episodio',
    addSeason: 'Añadir Temporada',
    seasonNameNumber: 'Nombre / Número de Temporada',
    batchUpload: 'Subir Varios Videos',
    saveChanges: 'Guardar Cambios',
    cancel: 'Cancelar',
    loading: 'Cargando...',
    minutes: 'min',
    noEpisodesFound: 'No se encontraron episodios para esta temporada.',
    continueWatching: 'Continuar Viendo',
    featuredNow: 'Destacado en PiFlix+'
  },
  'pt': {
    home: 'Início',
    movies: 'Filmes',
    series: 'Séries de TV',
    trending: 'Em Alta',
    watchlist: 'Minha Lista',
    premium: 'Premium VIP',
    admin: 'Painel Admin',
    search: 'Buscar',
    notifications: 'Notificações',
    language: 'Idioma',
    settings: 'Configurações',
    profile: 'Perfil',
    signInWithPi: 'Entrar com Pi Network',
    signOut: 'Sair',
    switchLogOut: 'Trocar conta / Sair',
    play: 'Assistir',
    watchNow: 'Assistir Agora',
    viewSeasons: 'Ver Temporadas',
    allSeasons: 'Todas as Temporadas',
    seasons: 'Temporadas',
    episodes: 'Episódios',
    episode: 'Episódio',
    addToWatchlist: 'Adicionar à Lista',
    inWatchlist: 'Na Minha Lista',
    like: 'Gostei',
    liked: 'Gostou',
    share: 'Compartilhar',
    free: 'Grátis',
    freeTier: 'Plano Grátis',
    vipSubscriber: 'Assinante VIP',
    upgradeWithPi: 'Fazer Upgrade com Pi',
    myWatchlistHistory: 'Minha Lista e Histórico',
    searchPlaceholder: 'Buscar filmes, séries, atores, diretores...',
    realVisitorAnalytics: 'Análise Real de Visitantes',
    quality: 'Qualidade',
    duration: 'Duração',
    reviews: 'Avaliações',
    rating: 'Classificação',
    cast: 'Elenco',
    director: 'Diretor',
    genre: 'Gênero',
    year: 'Ano',
    addEpisode: 'Adicionar Episódio',
    addSeason: 'Adicionar Temporada',
    seasonNameNumber: 'Nome / Número da Temporada',
    batchUpload: 'Upload em Lote de Vídeos',
    saveChanges: 'Salvar Alterações',
    cancel: 'Cancelar',
    loading: 'Carregando...',
    minutes: 'min',
    noEpisodesFound: 'Nenhum episódio encontrado para esta temporada.',
    continueWatching: 'Continuar Assistindo',
    featuredNow: 'Destaque no PiFlix+'
  },
  'de': {
    home: 'Startseite',
    movies: 'Filme',
    series: 'Serien',
    trending: 'Angesagt',
    watchlist: 'Merkliste',
    premium: 'Premium VIP',
    admin: 'Admin CMS',
    search: 'Suche',
    notifications: 'Benachrichtigungen',
    language: 'Sprache',
    settings: 'Einstellungen',
    profile: 'Profil',
    signInWithPi: 'Mit Pi anmelden',
    signOut: 'Abmelden',
    switchLogOut: 'Konto wechseln / Abmelden',
    play: 'Abspielen',
    watchNow: 'Jetzt ansehen',
    viewSeasons: 'Staffeln ansehen',
    allSeasons: 'Alle Staffeln',
    seasons: 'Staffeln',
    episodes: 'Folgen',
    episode: 'Folge',
    addToWatchlist: 'Zur Merkliste hinzufügen',
    inWatchlist: 'In Merkliste',
    like: 'Gefällt mir',
    liked: 'Gefällt dir',
    share: 'Teilen',
    free: 'Kostenlos',
    freeTier: 'Kostenloses Konto',
    vipSubscriber: 'VIP-Abonnent',
    upgradeWithPi: 'Mit Pi upgraden',
    myWatchlistHistory: 'Meine Merkliste & Verlauf',
    searchPlaceholder: 'Filme, Serien, Schauspieler suchen...',
    realVisitorAnalytics: 'Echte Besucher-Analysen',
    quality: 'Qualität',
    duration: 'Dauer',
    reviews: 'Bewertungen',
    rating: 'Bewertung',
    cast: 'Besetzung',
    director: 'Regie',
    genre: 'Genre',
    year: 'Jahr',
    addEpisode: 'Folge hinzufügen',
    addSeason: 'Staffel hinzufügen',
    seasonNameNumber: 'Staffel-Name / Nummer',
    batchUpload: 'Mehrere Videos hochladen',
    saveChanges: 'Änderungen speichern',
    cancel: 'Abbrechen',
    loading: 'Laden...',
    minutes: 'Min.',
    noEpisodesFound: 'Keine Folgen für diese Staffel gefunden.',
    continueWatching: 'Weiterschauen',
    featuredNow: 'Neu & Beliebt auf PiFlix+'
  },
  'tr': {
    home: 'Ana Sayfa',
    movies: 'Filmler',
    series: 'Diziler',
    trending: 'Trendler',
    watchlist: 'İzleme Listem',
    premium: 'Premium VIP',
    admin: 'Yönetici Paneli',
    search: 'Ara',
    notifications: 'Bildirimler',
    language: 'Dil',
    settings: 'Ayarlar',
    profile: 'Profil',
    signInWithPi: 'Pi ile Giriş Yap',
    signOut: 'Çıkış Yap',
    switchLogOut: 'Hesap Değiştir / Çıkış',
    play: 'Oynat',
    watchNow: 'Şimdi İzle',
    viewSeasons: 'Sezonları Gör',
    allSeasons: 'Tüm Sezonlar',
    seasons: 'Sezonlar',
    episodes: 'Bölümler',
    episode: 'Bölüm',
    addToWatchlist: 'Listeye Ekle',
    inWatchlist: 'Listede',
    like: 'Beğen',
    liked: 'Beğenildi',
    share: 'Paylaş',
    free: 'Ücretsiz',
    freeTier: 'Ücretsiz Plan',
    vipSubscriber: 'VIP Üye',
    upgradeWithPi: 'Pi ile Yükselt',
    myWatchlistHistory: 'İzleme Listem ve Geçmişim',
    searchPlaceholder: 'Film, dizi, oyuncu veya yönetmen ara...',
    realVisitorAnalytics: 'Gerçek Ziyaretçi İstatistikleri',
    quality: 'Kalite',
    duration: 'Süre',
    reviews: 'Yorumlar',
    rating: 'Puan',
    cast: 'Oyuncular',
    director: 'Yönetmen',
    genre: 'Tür',
    year: 'Yıl',
    addEpisode: 'Bölüm Ekle',
    addSeason: 'Sezon Ekle',
    seasonNameNumber: 'Sezon Adı / Numarası',
    batchUpload: 'Toplu Video Yükle',
    saveChanges: 'Değişiklikleri Kaydet',
    cancel: 'İptal',
    loading: 'Yükleniyor...',
    minutes: 'dk',
    noEpisodesFound: 'Bu sezon için henüz bölüm bulunamadı.',
    continueWatching: 'İzlemeye Devam Et',
    featuredNow: 'PiFlix+\'te Öne Çıkanlar'
  },
  'ja': {
    home: 'ホーム',
    movies: '映画',
    series: 'TVシリーズ',
    trending: 'トレンド',
    watchlist: 'マイリスト',
    premium: 'プレミアム VIP',
    admin: '管理パネル',
    search: '検索',
    notifications: 'お知らせ',
    language: '言語',
    settings: '設定',
    profile: 'プロフィール',
    signInWithPi: 'Pi Network でログイン',
    signOut: 'ログアウト',
    switchLogOut: 'アカウント切替 / ログアウト',
    play: '再生',
    watchNow: '今すぐ観る',
    viewSeasons: 'シーズンを見る',
    allSeasons: 'すべてのシーズン',
    seasons: 'シーズン',
    episodes: 'エピソード',
    episode: 'エピソード',
    addToWatchlist: 'マイリストに追加',
    inWatchlist: 'マイリスト登録中',
    like: 'いいね',
    liked: 'いいね済み',
    share: '共有',
    free: '無料',
    freeTier: '無料プラン',
    vipSubscriber: 'VIP 会員',
    upgradeWithPi: 'Pi でアップグレード',
    myWatchlistHistory: 'マイリストと視聴履歴',
    searchPlaceholder: '映画、TVシリーズ、俳優、監督を検索...',
    realVisitorAnalytics: 'リアルタイム訪問者分析',
    quality: '画質',
    duration: '再生時間',
    reviews: 'レビュー',
    rating: '評価',
    cast: '出演',
    director: '監督',
    genre: 'ジャンル',
    year: '公開年',
    addEpisode: 'エピソード追加',
    addSeason: 'シーズン追加',
    seasonNameNumber: 'シーズン名 / 番号',
    batchUpload: '動画を一括アップロード',
    saveChanges: '変更を保存',
    cancel: 'キャンセル',
    loading: '読み込み中...',
    minutes: '分',
    noEpisodesFound: 'このシーズンのエピソードはまだありません。',
    continueWatching: '続きを観る',
    featuredNow: 'PiFlix+ 注目の作品'
  },
  'ko': {
    home: '홈',
    movies: '영화',
    series: '시리즈',
    trending: '인기 콘텐츠',
    watchlist: '내가 찜한 리스트',
    premium: '프리미엄 VIP',
    admin: '관리자 패널',
    search: '검색',
    notifications: '알림',
    language: '언어',
    settings: '설정',
    profile: '프로필',
    signInWithPi: 'Pi Network로 로그인',
    signOut: '로그아웃',
    switchLogOut: '계정 전환 / 로그아웃',
    play: '재생',
    watchNow: '지금 시청하기',
    viewSeasons: '시즌 목록 보기',
    allSeasons: '모든 시즌',
    seasons: '시즌',
    episodes: '에피소드',
    episode: '에피소드',
    addToWatchlist: '찜한 리스트에 추가',
    inWatchlist: '찜한 리스트에 있음',
    like: '좋아요',
    liked: '좋아요 누름',
    share: '공유하기',
    free: '무료',
    freeTier: '무료 이용',
    vipSubscriber: 'VIP 구독자',
    upgradeWithPi: 'Pi 코인으로 업그레이드',
    myWatchlistHistory: '찜한 리스트 및 시청 기록',
    searchPlaceholder: '영화, 시리즈, 배우, 감독 검색...',
    realVisitorAnalytics: '실제 방문자 통계 분석',
    quality: '화질',
    duration: '재생시간',
    reviews: '리뷰',
    rating: '평점',
    cast: '출연',
    director: '감독',
    genre: '장르',
    year: '출시년도',
    addEpisode: '에피소드 추가',
    addSeason: '시즌 추가',
    seasonNameNumber: '시즌 이름 / 번호',
    batchUpload: '영상 일괄 업로드',
    saveChanges: '변경사항 저장',
    cancel: '취소',
    loading: '로딩 중...',
    minutes: '분',
    noEpisodesFound: '이 시즌에 등록된 에피소드가 없습니다.',
    continueWatching: '이어보기',
    featuredNow: 'PiFlix+ 추천 콘텐츠'
  }
};

const STORAGE_KEY = 'piflix_language';

export function getCurrentUserId(): string | null {
  try {
    const raw = localStorage.getItem('piflix_current_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) return parsed.id;
    }
  } catch {}
  return null;
}

export function getStoredLanguage(targetUserId?: string): SupportedLanguage {
  try {
    const uid = targetUserId || getCurrentUserId();
    if (uid) {
      const userLang = localStorage.getItem(`piflix_language_${uid}`) as SupportedLanguage;
      if (userLang && TRANSLATIONS[userLang]) {
        return userLang;
      }
    }
    const saved = localStorage.getItem(STORAGE_KEY) as SupportedLanguage;
    if (saved && TRANSLATIONS[saved]) {
      return saved;
    }
    // Fallback: check navigator language
    if (typeof navigator !== 'undefined' && navigator.language) {
      const code = navigator.language;
      const match = SUPPORTED_LANGUAGES.find(l => l.code.toLowerCase() === code.toLowerCase() || l.code.split('-')[0].toLowerCase() === code.split('-')[0].toLowerCase());
      if (match) return match.code;
    }
  } catch {}
  return 'en-US';
}

export function setAppLanguage(lang: SupportedLanguage, targetUserId?: string) {
  try {
    const uid = targetUserId || getCurrentUserId();
    if (uid) {
      localStorage.setItem(`piflix_language_${uid}`, lang);
      fetch('/api/user/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, language: lang })
      }).catch(() => {});
    }
    localStorage.setItem(STORAGE_KEY, lang);
    const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      if (langInfo?.isRtl) {
        document.documentElement.dir = 'rtl';
        document.documentElement.classList.add('rtl-layout');
      } else {
        document.documentElement.dir = 'ltr';
        document.documentElement.classList.remove('rtl-layout');
      }
    }
    window.dispatchEvent(new CustomEvent('piflix_language_change', { detail: { lang, userId: uid } }));
  } catch (err) {
    console.warn('Failed to set language:', err);
  }
}

// Initial setup on module execution
if (typeof document !== 'undefined') {
  const initialLang = getStoredLanguage();
  const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === initialLang);
  document.documentElement.lang = initialLang;
  if (langInfo?.isRtl) {
    document.documentElement.dir = 'rtl';
    document.documentElement.classList.add('rtl-layout');
  } else {
    document.documentElement.dir = 'ltr';
  }
}

export function useTranslation() {
  const [currentLang, setCurrentLangState] = useState<SupportedLanguage>(getStoredLanguage);

  useEffect(() => {
    const handleLangChange = (e: any) => {
      if (e.detail?.lang) {
        setCurrentLangState(e.detail.lang);
      } else {
        setCurrentLangState(getStoredLanguage());
      }
    };
    window.addEventListener('piflix_language_change', handleLangChange);
    return () => window.removeEventListener('piflix_language_change', handleLangChange);
  }, []);

  const t = (key: string, defaultText?: string): string => {
    // Direct safety mapping for all navigation keys to ensure internal keys are NEVER shown to users
    const navKeyFallbacks: Record<string, string> = {
      nav_home: 'Home',
      nav_movies: 'Movies',
      nav_series: 'Series',
      nav_trending: 'Trending',
      nav_watchlist: 'My List',
      nav_search: 'Search',
      nav_vip: 'VIP',
      home: 'Home',
      movies: 'Movies',
      series: 'Series',
      trending: 'Trending',
      watchlist: 'My List',
      myList: 'My List'
    };

    const langDict = TRANSLATIONS[currentLang] || TRANSLATIONS['en-US'];
    if (langDict && langDict[key]) {
      return langDict[key];
    }
    // If key starts with nav_, check stripped version in active language dictionary
    if (key.startsWith('nav_')) {
      const stripped = key.replace(/^nav_/, '');
      if (langDict && langDict[stripped]) {
        return langDict[stripped];
      }
    }

    const enDict = TRANSLATIONS['en-US'];
    if (enDict && enDict[key]) {
      return enDict[key];
    }
    if (key.startsWith('nav_')) {
      const stripped = key.replace(/^nav_/, '');
      if (enDict && enDict[stripped]) {
        return enDict[stripped];
      }
    }

    if (defaultText) {
      // Ensure defaultText also doesn't contain a raw nav_ key
      return defaultText.startsWith('nav_')
        ? navKeyFallbacks[defaultText] || defaultText.replace(/^nav_/, '')
        : defaultText;
    }

    if (navKeyFallbacks[key]) {
      return navKeyFallbacks[key];
    }

    // Never return a raw internal key with nav_ prefix
    if (key.startsWith('nav_')) {
      const clean = key.replace(/^nav_/, '');
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    return key;
  };

  const changeLanguage = (lang: SupportedLanguage) => {
    setAppLanguage(lang);
    setCurrentLangState(lang);
  };

  const currentLangInfo = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

  return {
    t,
    currentLanguage: currentLang,
    currentLang,
    currentLangInfo,
    changeLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
    isRtl: currentLangInfo.isRtl,
    isRTL: currentLangInfo.isRtl
  };
}
