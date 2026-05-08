import type { Clinic, Therapist, BlogPost, Testimonial, SupportGroup, FaqItem } from './types';

export const SITE = {
  name: 'مركز سواء',
  nameShort: 'مركز سواء للاستشارات الأسرية',
  desc: 'مركز متخصص في الاستشارات النفسية والأسرية وعلاج الإدمان بسرية تامة وكوادر سعودية مؤهلة.',
  logo: '/logos/diqqa-logo.svg',
  logoWhite: '/logos/diqqa-logo-white.svg',
  logoDark: '/logos/diqqa-logo-dark.svg',
  heroImage: '/images/hero.jpg',
  phone: '0558446605',
  email: 'support@sawaa.sa',
  address: 'الرياض، شارع تركي الأول، حي المحمدية',
  social: {
    tiktok: 'https://www.tiktok.com/@sawa_center',
    x: 'https://x.com/sawaa_co',
    instagram: 'https://www.instagram.com/sawaa.co/',
    youtube: 'https://www.youtube.com/channel/UCmyB91xiXERIJvHLt3TszBw',
  },
};

export const NAV_LINKS = [
  { label: 'الرئيسية', href: '/' },
  { label: 'المعالجون', href: '/therapists' },
  { label: 'مجموعات الدعم', href: '/support-groups' },
  { label: 'اختبار الإرهاق', href: '/burnout-test' },
  { label: 'اتصل بنا', href: '/contact' },
];

export const STATS = [
  { num: '+1500', label: 'أسرة مستفيدة' },
  { num: '+20',   label: 'خبير متخصص' },
  { num: '%97',   label: 'نسبة رضا العملاء' },
];

export const CLINICS: Clinic[] = [
  { slug: 'specialists',  name: 'استشارات الأخصائيين', desc: 'إشراف عيادي عن بُعد لتبادل الخبرات والاستشارات المهنية بين المتخصصين', icon: 'Users',         image: '/images/clinics/specialists.webp' },
  { slug: 'wellness',     name: 'عيادة العافية',        desc: 'دعم الموظفين والمتقاعدين في التعامل مع ضغوط العمل واستعادة التوازن',      icon: 'Heart',         image: '/images/clinics/wellness.webp' },
  { slug: 'support',      name: 'عيادة الدعم والمواساة', desc: 'مساندة المتضررين من الصدمات النفسية والأزمات بأساليب علمية متخصصة',     icon: 'HandHeart',     image: '/images/clinics/support.webp' },
  { slug: 'growth',       name: 'عيادة النمو والتطوير',  desc: 'رعاية نفسية متخصصة للأطفال والمراهقين دون 16 عاماً ودعم نموهم',           icon: 'Baby',          image: '/images/clinics/growth.webp' },
  { slug: 'happiness',    name: 'عيادة السعادة',         desc: 'استشارات زوجية وأسرية لبناء علاقات صحية ومستقرة وحل النزاعات',           icon: 'Smile',         image: '/images/clinics/happiness.webp' },
  { slug: 'adaptation',   name: 'عيادة التوافق والتكيف', desc: 'علاج الاضطرابات النفسية وتحسين الشخصية والتكيف مع تحديات الحياة',         icon: 'Brain',         image: '/images/clinics/adaptation.webp' },
  { slug: 'measurement',  name: 'عيادة القياس والتقويم', desc: 'اختبارات نفسية معتمدة تشمل MMPI واختبارات الذكاء والشخصية المقننة',      icon: 'ClipboardList', image: '/images/clinics/measurement.webp' },
  { slug: 'change',       name: 'عيادة التحفيز والتغيير',desc: 'علاج الإدمان والسلوكيات الخطرة بمنهجيات علمية حديثة وبرامج تعافي',       icon: 'RefreshCw',     image: '/images/clinics/change.webp' },
];

export const SUPPORT_GROUPS: SupportGroup[] = [
  { slug: 'art-therapy',    name: 'العلاج بالفن',    desc: 'التعبير الإبداعي لمعالجة المشاعر عبر الرسم والألوان في بيئة جماعية آمنة',    icon: 'Palette',     image: '/images/support-groups/art-therapy.jpg',    participants: '6-10 مشاركين', sessions: '8 جلسات',  format: 'حضوري' },
  { slug: 'grief-loss',     name: 'الحزن والفقد',    desc: 'دعم جماعي لمن فقدوا عزيزاً، ومساحة آمنة للتعبير والتعافي',                  icon: 'HeartCrack',  image: '/images/support-groups/grief-loss.jpg',     participants: '6-10 مشاركين', sessions: '10 جلسات', format: 'مختلط' },
  { slug: 'recovery-circle',name: 'دائرة التعافي',   desc: 'دعم مستمر للمتعافين من الإدمان وتعزيز الوقاية من الانتكاسة',                 icon: 'RefreshCw',   image: '/images/support-groups/recovery-circle.jpg',participants: '6-10 مشاركين', sessions: '12 جلسة',  format: 'حضوري' },
  { slug: 'new-mothers',    name: 'الأمهات الجدد',   desc: 'دعم ما بعد الولادة، اكتئاب الأمومة، وبناء الثقة بدور الأم',                  icon: 'Baby',        image: '/images/support-groups/new-mothers.jpg',    participants: '6-10 مشاركين', sessions: '6 جلسات',  format: 'عن بُعد' },
  { slug: 'teen-support',   name: 'دعم المراهقين',   desc: 'مهارات اجتماعية وبناء الهوية في مجموعة أقران من نفس الفئة',                 icon: 'Users',       image: '/images/support-groups/teen-support.jpg',   participants: '6-10 مشاركين', sessions: '8 جلسات',  format: 'حضوري' },
  { slug: 'social-anxiety', name: 'القلق الاجتماعي', desc: 'تدريب تدريجي على المواقف الاجتماعية في بيئة داعمة وآمنة',                   icon: 'UsersRound',  image: '/images/support-groups/social-anxiety.jpg', participants: '6-10 مشاركين', sessions: '10 جلسات', format: 'مختلط' },
];

export const THERAPISTS: Therapist[] = [
  { slug: 'aisha-hijazi',         clinicSlugs: ['adaptation'],              name: 'د. عائشة حجازي', role: 'أستاذ مشارك استشاري',          badge: 'أستاذ مشارك', exp: '+20 سنة', letter: 'ع' },
  { slug: 'ohoud-alshalhoub',     clinicSlugs: ['growth', 'support'],       name: 'د. عهود الشلهوب', role: 'استشاري علم النفس',            badge: 'استشاري',   exp: '+15 سنة', letter: 'ع' },
  { slug: 'majed-alharbi',        clinicSlugs: ['adaptation', 'happiness'], name: 'د. ماجد الحربي',  role: 'استشاري نفسي',                 badge: 'استشاري',   exp: '+15 سنة', letter: 'م', image: '/images/team/majed-h.webp' },
  { slug: 'fahad-alharbi',        clinicSlugs: ['adaptation'],              name: 'د. فهد الحربي',   role: 'أخصائي أول علم النفس العيادي', badge: 'أخصائي أول',exp: '+15 سنة', letter: 'ف', image: '/images/team/fahad.webp' },
  { slug: 'mohammad-ouda',        clinicSlugs: ['support'],                 name: 'د. محمد عودة',    role: 'أخصائي نفسي',                  badge: 'أخصائي',    exp: '+30 سنة', letter: 'م' },
  { slug: 'bandar-alelm',         clinicSlugs: ['adaptation'],              name: 'د. بندر العلم',   role: 'استشاري علم النفس',            badge: 'استشاري',   exp: '+10 سنوات', letter: 'ب' },
  { slug: 'noura-alanazi',        clinicSlugs: ['happiness'],               name: 'د. نورة العنزي',  role: 'أخصائي اجتماعي أول',           badge: 'أخصائي أول',exp: '+12 سنة', letter: 'ن' },
  { slug: 'fayzah-alanazi',       clinicSlugs: ['happiness'],               name: 'د. فايزة العنزي', role: 'استشاري اجتماعي',              badge: 'استشاري',   exp: '+15 سنة', letter: 'ف' },
  { slug: 'noura-aldawood',       clinicSlugs: ['happiness', 'adaptation'], name: 'د. نورة سعد الداود', role: 'استشاري اجتماعي',           badge: 'استشاري',   exp: '+15 سنة', letter: 'ن' },
  { slug: 'sara-aljebreen',       clinicSlugs: ['wellness'],                name: 'أ. سارة الجبرين', role: 'أخصائي نفسي',                  badge: 'أخصائي',    exp: '+7 سنوات', letter: 'س' },
  { slug: 'amal-alhousawi',       clinicSlugs: ['wellness'],                name: 'أ. أمل الهوساوي', role: 'أخصائي نفسي',                  badge: 'أخصائي',    exp: '+15 سنة', letter: 'أ', image: '/images/team/amal.webp' },
  { slug: 'najia-alabbasi',       clinicSlugs: ['wellness'],                name: 'أ. ناجية العباسي', role: 'أخصائي نفسي',                 badge: 'أخصائي',    exp: '+10 سنوات', letter: 'ن', image: '/images/team/najia.webp' },
  { slug: 'khaled-alanazi',       clinicSlugs: ['change'],                  name: 'أ. خالد العنزي',  role: 'أخصائي اجتماعي أول',           badge: 'أخصائي أول',exp: '+30 سنة', letter: 'خ' },
  { slug: 'najeh-alanazi',        clinicSlugs: ['happiness'],               name: 'أ. ناجح العنزي',  role: 'أخصائي اجتماعي أول',           badge: 'أخصائي أول',exp: '+15 سنة', letter: 'ن', image: '/images/team/najeh.webp' },
  { slug: 'nisreen-alsabban',     clinicSlugs: ['happiness'],               name: 'أ. نسرين الصبان', role: 'أخصائي اجتماعي أول',           badge: 'أخصائي أول',exp: '+15 سنة', letter: 'ن', image: '/images/team/nisreen.webp' },
  { slug: 'majed-alfaisal',       clinicSlugs: ['change'],                  name: 'أ. ماجد الفيصل',  role: 'معالج إدمان',                  badge: 'معالج',     exp: '+20 سنة', letter: 'م', image: '/images/team/majed-f.webp' },
  { slug: 'khaled-almohammad',    clinicSlugs: ['adaptation'],              name: 'أ. خالد المحمد',  role: 'أخصائي نفسي',                  badge: 'أخصائي',    exp: '+15 سنة', letter: 'خ', image: '/images/team/khaled-m.webp' },
  { slug: 'doaa-alfadli',         clinicSlugs: ['wellness'],                name: 'أ. دعاء الفضلي',  role: 'أخصائي نفسي',                  badge: 'أخصائي',    exp: '+5 سنوات', letter: 'د', image: '/images/team/doaa.webp' },
];

export const BLOG_POSTS: BlogPost[] = [
  { title: 'بـ 6 خطوات استعد إيقاع حياتك بعد الإجازة',   date: 'أبريل 2025',  tag: 'علم اجتماع', image: '/images/blog/post-1.webp' },
  { title: 'لماذا القلق والتوتر أخطر ما يمر به الإنسان؟', date: 'مارس 2025',   author: 'د. عهود الشلهوب', tag: 'علم النفس', image: '/images/blog/post-2.webp' },
  { title: 'الاحتراق الوظيفي: كيف تتعرف عليه وتتعامل معه',date: 'أكتوبر 2024', author: 'د. عهود الشلهوب', tag: 'علم النفس', image: '/images/blog/post-3.webp' },
];

export const TESTIMONIALS: Testimonial[] = [
  { text: 'مركز فيه جهود جبارة ورائعة، أخص بالذكر الدكتورة عهود التي قدمت لنا دعماً استثنائياً ومهنية عالية.', name: 'أبو يامن',      label: 'عميل', letter: 'أ' },
  { text: 'من أفضل المراكز صحياً ونفسياً، الابتسامة ما تفارقهم والتعامل راقي جداً. أنصح الجميع.',               name: 'متعب الحربي',   label: 'عميل', letter: 'م' },
  { text: 'مركز تخصصي واعد، راقي ومريح. البيئة مهيأة ممتاز والفريق محترف ومتعاون.',                            name: 'Moutaz Ali',    label: 'عميل', letter: 'M' },
];

export const FAQS: FaqItem[] = [
  { q: 'كم تكلفة الجلسة؟',               a: 'تختلف تكلفة الجلسة حسب نوع الاستشارة والمعالج. للاطلاع على الأسعار التفصيلية يمكنك التواصل معنا أو زيارة صفحة الحجز.' },
  { q: 'هل تقبلون التأمين الطبي؟',       a: 'نعمل حالياً على توسيع شبكة شركاء التأمين. تواصل معنا للاستفسار عن آخر التحديثات بخصوص شركة التأمين الخاصة بك.' },
  { q: 'هل الجلسات سرية تماماً؟',        a: 'نعم — جميع الجلسات والبيانات محمية بسرية مهنية مطلقة وفق معايير الهيئة السعودية للتخصصات الصحية. لا تُشارك أي معلومات مع أي طرف دون إذنك الصريح.' },
  { q: 'كم تستغرق الجلسة الواحدة؟',      a: 'الجلسة الاعتيادية 45 دقيقة، وقد تختلف حسب نوع الاستشارة وتوصية المعالج.' },
  { q: 'ما الفرق بين الجلسة الحضورية وعن بُعد؟', a: 'الحضورية في مقر العيادة بالرياض، وعن بُعد عبر منصة آمنة مشفّرة من أي مكان. كلاهما بنفس الجودة والكفاءة العلاجية.' },
  { q: 'كيف تكون الجلسة الأولى؟',        a: 'تقييم أولي يستمع فيه المعالج لاحتياجاتك ويبني خطة علاجية مناسبة لك. لا التزام بعدد جلسات محدد — أنت تقرر.' },
];

export const PAYMENT_METHODS = [
  { name: 'tabby',      label: 'tabby',      src: '/logos/tabby.webp' },
  { name: 'tamara',     label: 'tamara',     src: '/logos/tamara.svg' },
  { name: 'mada',       label: 'مدى',        src: '/logos/mada.svg' },
  { name: 'visa',       label: 'Visa',       src: '/logos/visa.svg' },
  { name: 'mastercard', label: 'Mastercard', src: '/logos/mastercard.svg' },
  { name: 'apple-pay',  label: 'Apple Pay',  src: '/logos/apple-pay.svg' },
];
