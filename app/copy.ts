// Bilingual copy for the wedding invitation. `Copy` is a single interface both
// languages must satisfy, so a missing translation is a compile error. Free text
// stored on the server (meal names and descriptions) renders as saved; the words
// around it are translated here.

export type Lang = "en" | "bg";

// "A, B and C" / „А, Б и В" — never "A and B and C".
const joinNames = (names: string[], pair: string) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")}${pair}${names[names.length - 1]}`;

export type StatusKey =
  | "needAnswers" | "draftRestored" | "savingReply" | "replyConflict" | "replySaved" | "replySaveFailed"
  | "loadingLatestReply" | "latestReplyLoaded" | "latestReplyFailed"
  | "needMeals" | "savingMeals" | "mealsConflict" | "mealsSaved" | "mealsSaveFailed"
  | "loadingLatestMeals" | "latestMealsLoaded" | "latestMealsFailed";

export interface Copy {
  meta: { title: string };
  names: { her: string; him: string; coupleAria: string };
  toggle: { aria: string };
  gate: {
    eyebrow: string;
    titles: Record<"checking" | "missing" | "invalid" | "unavailable", string>;
    messages: Record<"checking" | "missing" | "invalid" | "unavailable", string>;
    retry: string;
    privacy: string;
    footer: string;
  };
  guest: {
    statusAttending: string;
    statusDeclined: string;
    statusPending: string;
    yes: string;
    no: string;
    notesLabel: string;
    notesPlaceholder: string;
    attendanceAria: (name: string) => string;
  };
  contacts: { prompt: string; aria: string; phone: string };
  nav: { aria: string; rsvp: string };
  hero: {
    eyebrow: string;
    subtitle: string;
    dateAria: string;
    day: string;
    dateLong: string;
    venueName: string;
    venueCountry: string;
    daysToGo: (n: number) => string;
    replyBy: string;
    scrollPrompt: string;
  };
  rsvp: {
    introTitleLines: [string, string];
    introBody: string;
    replyDate: string;
    progressAnswered: (answered: number, total: number) => string;
    progressOutstanding: (names: string[]) => string;
    saveNote: (names: string[]) => string;
    saveLabels: { idle: string; saving: string; error: string; conflict: string };
    loadLatest: string;
    receiptAria: string;
    receiptTitle: (name: string) => string;
    receiptAttending: (names: string[]) => string;
    receiptDeclined: string;
    receiptMealsOpen: { pre: string; link: string; post: string };
    receiptMealsLater: string;
  };
  mealTeaser: { eyebrow: string; title: string; body: string; btn: string };
  mealNotice: {
    aria: string;
    eyebrow: string;
    titleLines: [string, string];
    bodyPre: string;
    bodyMonth: string;
    bodyPost: string;
  };
  program: { title: string; stops: Array<{ time: string; name: string; desc: string }> };
  venue: {
    eyebrow: string;
    mapTitle: string;
    captionLabel: string;
    captionName: string;
    captionPlace: string;
    mapsLink: string;
    sceneAria: string;
    sceneName: string;
    sceneTag: string;
    dressLabel: string;
    dressBody: string;
  };
  stay: { aria: string; titleLines: [string, string]; body: string[]; foot: string };
  story: {
    eyebrow: string;
    titleLines: [string, string];
    milestones: Array<{ label: string; text: string }>;
    finale: string;
    photoAlt: string;
  };
  footer: { thanks: string; tagline: string; sign: string };
  meals: {
    back: string;
    eyebrow: string;
    introTitleLines: [string, string];
    introBody: string;
    closed: { eyebrow: string; title: string; body: string; btn: string };
    rsvpFirst: { title: string; body: string; btn: string };
    emptyMenu: string;
    saveLabels: { idle: string; saving: string; error: string; conflict: string };
    loadLatest: string;
  };
  status: Record<StatusKey, string>;
}

const en: Copy = {
  meta: { title: "Ekaterina & Dimitar | 20 June 2027" },
  names: { her: "Ekaterina", him: "Dimitar", coupleAria: "Ekaterina and Dimitar" },
  toggle: { aria: "Language" },
  gate: {
    eyebrow: "Private invitation",
    titles: {
      checking: "Opening your private invitation…",
      missing: "This invitation has a personal address.",
      invalid: "We could not open this invitation.",
      unavailable: "The invitation garden is resting.",
    },
    messages: {
      checking: "A little patience while your household invitation blooms.",
      missing: "Please use the personal link sent to your household. It opens your invitation directly, with only the people invited with you. Can't find it? Reply to the message it came with and we will send it again.",
      invalid: "The link may be incomplete or out of date. Reply to the message that brought you this link and we will send you a fresh one.",
      unavailable: "Please check your connection and try again in a moment. Your invitation and any saved reply are safe.",
    },
    retry: "Try the link again",
    privacy: "We use your invitation details and reply only to plan our wedding. Guest data will be deleted by 27 June 2027.",
    footer: "Midalidare Estate · Bulgaria",
  },
  guest: {
    statusAttending: "Joyfully attending",
    statusDeclined: "Unable to attend",
    statusPending: "Choose an answer below",
    yes: "Will attend",
    no: "Cannot attend",
    notesLabel: "Dietary or accessibility needs",
    notesPlaceholder: "Optional, tell us what would help you feel comfortable",
    attendanceAria: (name) => `Attendance for ${name}`,
  },
  contacts: { prompt: "Prefer to reply personally?", aria: "Contact options", phone: "Call us" },
  nav: { aria: "Invitation navigation", rsvp: "RSVP" },
  hero: {
    eyebrow: "Celebrate with us",
    subtitle: "as we marry among the vines",
    dateAria: "Wedding date and venue",
    day: "Sunday",
    dateLong: "20 June 2027",
    venueName: "Midalidare Estate",
    venueCountry: "Bulgaria",
    daysToGo: (n) => `${n} day${n === 1 ? "" : "s"} to go`,
    replyBy: "Kindly reply by 31 December 2026",
    scrollPrompt: "Your invitation",
  },
  rsvp: {
    introTitleLines: ["We would love to", "celebrate with you."],
    introBody: "Please let us know whether you can join us.",
    replyDate: "By 31 December 2026",
    progressAnswered: (answered, total) => `${answered} of ${total} answered`,
    progressOutstanding: (names) => `${names.join(", ")} still to answer`,
    saveNote: (names) => `${names.length} answer${names.length > 1 ? "s" : ""} still needed for ${joinNames(names, " and ")}`,
    saveLabels: { idle: "Save our reply", saving: "Saving…", error: "Try saving again", conflict: "Latest reply needed" },
    loadLatest: "Load latest saved reply",
    receiptAria: "RSVP confirmation",
    receiptTitle: (name) => `Reply confirmed for ${name}`,
    receiptAttending: (names) => `${joinNames(names, " and ")} will join us on 20 June 2027.`,
    receiptDeclined: "We will miss you, and we are grateful you let us know.",
    receiptMealsOpen: { pre: "The menu is open.", link: "Choose a meal for each guest", post: "with this same invitation." },
    receiptMealsLater: "In January we will open the menu. We will let you know, and this same personal link is where you will choose a meal for each guest.",
  },
  mealTeaser: {
    eyebrow: "The wedding table",
    title: "Meal choices are now open",
    body: "Choose a meal for each attending guest using this same private invitation.",
    btn: "Choose meals",
  },
  mealNotice: {
    aria: "Meal choices",
    eyebrow: "The wedding table",
    titleLines: ["The menu is", "still blooming"],
    bodyPre: "Dinner choices open in ",
    bodyMonth: "January",
    bodyPost: ". Nothing to do here just yet! We will let you know to return to this invitation and make your dinner choice in due time.",
  },
  program: {
    title: "How the day unfolds",
    stops: [
      { time: "15:30", name: "Start", desc: "The day begins with the stealing of the bride, a Bulgarian tradition you won't want to miss." },
      { time: "16:30", name: "Ceremony", desc: "Our vows among the vines." },
      { time: "17:30", name: "Drinks", desc: "A glass of the estate's own wine, something to eat, and the best view on the property." },
      { time: "19:30", name: "Dinner", desc: "Your chosen dish, a few Bulgarian traditions, and no shortage of wine." },
      { time: "21:00", name: "Dancing", desc: "Our favourite songs and a few hora. No experience needed, hold hands and follow whoever's on your right." },
    ],
  },
  venue: {
    eyebrow: "The celebration",
    mapTitle: "Google Map showing Midalidare Estate in Mogilovo, Bulgaria",
    captionLabel: "Our venue",
    captionName: "Midalidare Estate",
    captionPlace: "Mogilovo, Bulgaria",
    mapsLink: "Open in Google Maps",
    sceneAria: "An abstract garden view of Midalidare Estate, from a warm afternoon into a starlit celebration",
    sceneName: "Midalidare",
    sceneTag: "Among the Bulgarian vines",
    dressLabel: "Dress code",
    dressBody: "Elegant attire for an evening among the vines. Come in whatever makes you feel your best, and do bring a light jacket or a scarf, it turns cool once the sun goes down.",
  },
  stay: {
    aria: "Accommodation and the venue",
    titleLines: ["Accommodation", "& the Venue itself"],
    body: [
      "Midalidare Estate is a picturesque wine estate nestled among the forests of Sredna Gora, with two wineries and four vineyards stretching across 160 hectares. Accommodation is available in the beautifully restored 200-year-old schoolhouse, now home to Midalidare Hotel & SPA, as well as in charming nearby guest houses and in the nearest town, Stara Zagora. The estate also features a spa and gastropub.",
      "Once you RSVP, we'll arrange your accommodation either on the estate or nearby.",
    ],
    foot: "Heading home the same night? There is free parking on the estate.",
  },
  story: {
    eyebrow: "Our love story",
    titleLines: ["A story", "in bloom"],
    milestones: [
      { label: "Where It All Began", text: "We met in the summer of 2015, while we were both still in high school, and it didn't take long for something special to begin." },
      { label: "Vienna", text: "We moved to Vienna to pursue our bachelor's degrees and ended up calling this city home for five unforgettable years." },
      { label: "London", text: "Our journey continued in London, where a new adventure became home, a place to grow together, build our careers, and shape our future." },
      { label: "The Big Question", text: "After ten years together, a befitting proposal at the Queen's House marked the start of our next chapter." },
    ],
    finale: "Ten years, three cities, and countless memories later, this is only the beginning.",
    photoAlt: "Ekaterina and Dimitar",
  },
  footer: {
    thanks: "Thank you for being part of our story.",
    tagline: "We cannot wait to celebrate our special day with you.",
    sign: "Ekaterina & Dimitar · 20 June 2027",
  },
  meals: {
    back: "← Back to invitation",
    eyebrow: "The wedding table",
    introTitleLines: ["A meal chosen", "just for you"],
    introBody: "Use the same private invitation to choose for each attending guest.",
    closed: {
      eyebrow: "Coming later",
      title: "The menu is still blooming.",
      body: "There is nothing you need to do yet. We will let you know when meal choices open, and this same private invitation will still work.",
      btn: "Return to the invitation",
    },
    rsvpFirst: { title: "RSVP first", body: "Please confirm who is attending before choosing meals.", btn: "Complete RSVP" },
    emptyMenu: "The menu for this guest is still being prepared.",
    saveLabels: { idle: "Save meal choices", saving: "Saving…", error: "Try saving again", conflict: "Latest choices needed" },
    loadLatest: "Load latest saved choices",
  },
  status: {
    needAnswers: "Please choose an answer for each invited guest.",
    draftRestored: "We kept the answers you started on this phone. They are not sent yet. Please review and save your reply.",
    savingReply: "Saving your reply…",
    replyConflict: "This invitation was updated on another phone. Load the latest saved reply, then review it before saving again.",
    replySaved: "Your reply is confirmed. You can return with the same personal link if anything changes.",
    replySaveFailed: "We could not save your reply. Your choices are safe on this phone. Please try again.",
    loadingLatestReply: "Loading the latest saved reply…",
    latestReplyLoaded: "The latest saved reply is now shown. Please review it before making any changes.",
    latestReplyFailed: "We could not load the latest reply. Please check your connection and try again.",
    needMeals: "Please choose a meal for each attending guest.",
    savingMeals: "Saving meal choices…",
    mealsConflict: "This invitation was updated on another phone. Load the latest choices before saving again.",
    mealsSaved: "Meal choices confirmed. Thank you.",
    mealsSaveFailed: "We could not save your meal choices. Please try again.",
    loadingLatestMeals: "Loading the latest saved choices…",
    latestMealsLoaded: "The latest saved choices are now shown. Please review them before making changes.",
    latestMealsFailed: "We could not load the latest choices. Please check your connection and try again.",
  },
};

const bg: Copy = {
  meta: { title: "Екатерина и Димитър | 20 юни 2027 г." },
  names: { her: "Екатерина", him: "Димитър", coupleAria: "Екатерина и Димитър" },
  toggle: { aria: "Език" },
  gate: {
    eyebrow: "Лична покана",
    titles: {
      checking: "Отваряме личната ви покана…",
      missing: "Тази покана носи вашето име.",
      invalid: "Не успяхме да отворим поканата.",
      unavailable: "Градината с покани си почива.",
    },
    messages: {
      checking: "Малко търпение, докато поканата на вашето семейство разцъфне.",
      missing: "Моля, използвайте личния линк, изпратен на вашето семейство. Той отваря поканата ви директно, само с хората, поканени с вас. Ако не го откривате, отговорете на съобщението, с което е пристигнал, и ще ви го изпратим отново.",
      invalid: "Линкът може да е непълен или остарял. Отговорете на съобщението, с което получихте линка, и ще ви изпратим нов.",
      unavailable: "Проверете връзката и опитайте отново след малко. Поканата и запазеният ви отговор са в безопасност.",
    },
    retry: "Опитайте отново",
    privacy: "Използваме данните от поканата и отговора ви само за организацията на сватбата. Данните за гостите ще бъдат изтрити до 27 юни 2027 г.",
    footer: "Мидалидаре Естейт · България",
  },
  guest: {
    statusAttending: "С радост ще присъства",
    statusDeclined: "Няма да може да присъства",
    statusPending: "Изберете отговор по-долу",
    yes: "Ще присъства",
    no: "Няма да присъства",
    notesLabel: "Хранителни ограничения или специални нужди",
    notesPlaceholder: "По желание, кажете ни какво би ви помогнало да се чувствате добре",
    attendanceAria: (name) => `Отговор за ${name}`,
  },
  contacts: { prompt: "Предпочитате да отговорите лично?", aria: "Начини за връзка", phone: "Обадете ни се" },
  nav: { aria: "Навигация в поканата", rsvp: "Отговор" },
  hero: {
    eyebrow: "Празнувайте с нас",
    subtitle: "Нашия специален ден",
    dateAria: "Дата и място на сватбата",
    day: "Неделя",
    dateLong: "20 юни 2027 г.",
    venueName: "Мидалидаре Естейт",
    venueCountry: "България",
    daysToGo: (n) => (n === 1 ? "Остава 1 ден" : `Остават ${n} дни`),
    replyBy: "Молим да потвърдите присъствието си до 31 декември 2026 г.",
    scrollPrompt: "Вашата покана",
  },
  rsvp: {
    introTitleLines: ["Ще се радваме", "да празнуваме с вас."],
    introBody: "Моля, потвърдете присъствието си.",
    replyDate: "До 31 декември 2026 г.",
    progressAnswered: (answered, total) => `Отговорени: ${answered} от ${total}`,
    progressOutstanding: (names) => `Очакваме отговор за: ${names.join(", ")}`,
    saveNote: (names) => (names.length === 1 ? `Остава отговор за ${names[0]}` : `Остават отговори за ${joinNames(names, " и ")}`),
    saveLabels: { idle: "Запазете отговора си", saving: "Запазваме…", error: "Опитайте отново", conflict: "Нужен е последният отговор" },
    loadLatest: "Заредете последния запазен отговор",
    receiptAria: "Потвърждение на отговора",
    receiptTitle: (name) => `Отговорът на ${name} е потвърден`,
    receiptAttending: (names) => `${joinNames(names, " и ")} ще ${names.length === 1 ? "бъде" : "бъдат"} с нас на 20 юни 2027 г.`,
    receiptDeclined: "Ще ни липсвате. Благодарим, че ни казахте.",
    receiptMealsOpen: { pre: "Менюто е отворено.", link: "Изберете ястие за всеки гост", post: "със същата покана." },
    receiptMealsLater: "През януари ще отворим менюто. Ще ви известим, а изборът се прави със същия личен линк.",
  },
  mealTeaser: {
    eyebrow: "Сватбената трапеза",
    title: "Изборът на меню е отворен",
    body: "Изберете ястие за всеки присъстващ гост със същата лична покана.",
    btn: "Изберете меню",
  },
  mealNotice: {
    aria: "Избор на меню",
    eyebrow: "Сватбената трапеза",
    titleLines: ["Менюто още", "зрее"],
    bodyPre: "През ",
    bodyMonth: "януари",
    bodyPost: " ще ви дадем знак, когато дойде време да изберете своето ястие.",
  },
  program: {
    title: "Как ще протече денят",
    stops: [
      { time: "15:30", name: "Начало", desc: "Преди празникът да започне, булката трябва да бъде открадната — българска традиция, която няма как да пропуснем." },
      { time: "16:30", name: "Церемония", desc: "Нашите обети сред лозята." },
      { time: "17:30", name: "Коктейл", desc: "Чаша вино, нещо вкусно и хубава гледка, на която да се насладим заедно." },
      { time: "19:30", name: "Вечеря", desc: "Вкусно ястие по ваш избор, български традиции и много поводи за наздравица." },
      { time: "21:00", name: "Танци", desc: "Любимите ни песни и, разбира се, някое и друго хоро. Опит не е нужен, хванете се за ръце и следвайте съседа си отдясно." },
    ],
  },
  venue: {
    eyebrow: "Празникът",
    mapTitle: "Карта на Google с Мидалидаре Естейт в Могилово, България",
    captionLabel: "Нашето място",
    captionName: "Мидалидаре Естейт",
    captionPlace: "Могилово, България",
    mapsLink: "Отворете в Google Maps",
    sceneAria: "Абстрактна градинска гледка от Мидалидаре Естейт, от топъл следобед до празник под звездите",
    sceneName: "Мидалидаре",
    sceneTag: "Сред българските лозя",
    dressLabel: "Дрескод",
    dressBody: "Елегантно облекло за вечер сред лозята. Елате в своя стил и не забравяйте нещо за наметване, след залез слънце става прохладно.",
  },
  stay: {
    aria: "Настаняване и мястото",
    titleLines: ["Настаняване и", "мястото"],
    body: [
      "Мидалидаре Естейт е живописна винарска изба, сгушена сред горите на Средна гора. Със своите две винарни и четири лозя, мястото съчетава любовта към виното с красотата и спокойствието на природата.",
      "За гостите, които ще останат за нощта, са предвидени места за настаняване: в красиво реставрираната 200-годишна училищна сграда, днес дом на Midalidare Hotel & SPA, както и в очарователни къщи за гости наблизо и в най-близкия град, Стара Загора. На разположение са още SPA зона и гастропъб.",
      "Щом потвърдите присъствието си, ще се погрижим за настаняването ви.",
    ],
    foot: "Прибирате се същата вечер? На място има безплатен паркинг.",
  },
  story: {
    eyebrow: "Нашата любовна история",
    titleLines: ["История", "в разцвет"],
    milestones: [
      { label: "Там, откъдето започна всичко", text: "Срещнахме се през лятото на 2015 г., докато и двамата все още бяхме в гимназията. Не след дълго между нас се появи нещо специално, което с времето се превърна в нашата история." },
      { label: "Виена", text: "През 2018 г. се преместихме във Виена, за да учим бакалавър. Пет години този град беше нашият дом, време, изпълнено с нови места, приятелства, приключения и много общи спомени." },
      { label: "Лондон", text: "След Виена дойде ред на Лондон. Започнахме нов етап от живота си, открихме нов дом и продължихме да растем, всеки по своя път, но винаги заедно." },
      { label: "Едно „да“", text: "След десет години заедно дойде и онзи въпрос, на който и двамата знаехме отговора. В Queen's House казахме „да“ на следващата ни глава." },
    ],
    finale: "Десет години, три града и безброй спомени по-късно, все още ни предстои най-хубавото.",
    photoAlt: "Екатерина и Димитър",
  },
  footer: {
    thanks: "Благодарим ви, че сте част от нашата история.",
    tagline: "Нямаме търпение да празнуваме нашия специален ден с вас.",
    sign: "Екатерина и Димитър · 20 юни 2027 г.",
  },
  meals: {
    back: "← Обратно към поканата",
    eyebrow: "Сватбената трапеза",
    introTitleLines: ["Ястие", "по ваш избор"],
    introBody: "Използвайте същата лична покана, за да изберете ястие за всеки присъстващ гост.",
    closed: {
      eyebrow: "Предстои",
      title: "Менюто още зрее.",
      body: "Засега няма какво да правите. Ще ви известим, когато отворим избора на ястия. Същата лична покана ще важи.",
      btn: "Обратно към поканата",
    },
    rsvpFirst: { title: "Първо отговорете", body: "Моля, потвърдете кой ще присъства, преди да изберете ястия.", btn: "Попълнете отговора" },
    emptyMenu: "Менюто за този гост още се подготвя.",
    saveLabels: { idle: "Запазете избора на меню", saving: "Запазваме…", error: "Опитайте отново", conflict: "Нужен е последният избор" },
    loadLatest: "Заредете последния запазен избор",
  },
  status: {
    needAnswers: "Моля, изберете отговор за всеки поканен гост.",
    draftRestored: "Запазихме започнатите отговори на този телефон. Те още не са изпратени. Моля, прегледайте ги и запазете отговора си.",
    savingReply: "Запазваме отговора ви…",
    replyConflict: "Поканата е била променена от друг телефон. Заредете последния запазен отговор и го прегледайте, преди да запазите отново.",
    replySaved: "Отговорът ви е потвърден. Можете да се върнете със същия личен линк, ако нещо се промени.",
    replySaveFailed: "Не успяхме да запазим отговора. Изборът ви е запазен на този телефон. Моля, опитайте отново.",
    loadingLatestReply: "Зареждаме последния запазен отговор…",
    latestReplyLoaded: "Показан е последният запазен отговор. Прегледайте го, преди да правите промени.",
    latestReplyFailed: "Не успяхме да заредим последния отговор. Проверете връзката и опитайте отново.",
    needMeals: "Моля, изберете ястие за всеки присъстващ гост.",
    savingMeals: "Запазваме избора на меню…",
    mealsConflict: "Поканата е била променена от друг телефон. Заредете последния избор, преди да запазите отново.",
    mealsSaved: "Изборът на меню е потвърден. Благодарим ви.",
    mealsSaveFailed: "Не успяхме да запазим избора на меню. Моля, опитайте отново.",
    loadingLatestMeals: "Зареждаме последния запазен избор…",
    latestMealsLoaded: "Показан е последният запазен избор. Прегледайте го, преди да правите промени.",
    latestMealsFailed: "Не успяхме да заредим последния избор. Проверете връзката и опитайте отново.",
  },
};

export const COPY: Record<Lang, Copy> = { en, bg };
