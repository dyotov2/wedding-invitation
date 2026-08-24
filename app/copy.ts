// Bilingual copy for the wedding invitation. `Copy` is a single interface both
// languages must satisfy, so a missing translation is a compile error. Names and
// free text stored on the server (the names in a household greeting, meal names
// and descriptions) render as saved; the words around them are translated here.
// A saved greeting holds only the names: rsvp.greeting adds "Dear"/"Скъпи" in the
// active language.

export type Lang = "en" | "bg";

export type StatusKey =
  | "needAnswers" | "savingReply" | "replyConflict" | "replySaved" | "replySaveFailed"
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
    greeting: (name: string) => string;
    introTitleLines: [string, string];
    introBody: string;
    kindly: string;
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
    pill: string;
    foot: string;
  };
  program: { title: string; sub: string; stops: Array<{ time: string; name: string; desc: string }> };
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
  stay: { aria: string; titleLines: [string, string]; body: [string, string]; foot: string };
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
      missing: "Please use the personal link sent to your household. It opens your invitation directly, with only the people invited with you.",
      invalid: "The link may be incomplete or out of date. Please ask Ekaterina or Dimitar to resend your personal invitation.",
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
    yes: "We will attend",
    no: "We cannot attend",
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
    replyBy: "Kindly reply by 1 December 2026",
    scrollPrompt: "Your invitation",
  },
  rsvp: {
    greeting: (name) => `Dear ${name}`,
    introTitleLines: ["We would love to", "celebrate with you."],
    introBody: "Please let us know whether you can join us.",
    kindly: "Kindly reply",
    replyDate: "By 1 December 2026",
    progressAnswered: (answered, total) => `${answered} of ${total} answered`,
    progressOutstanding: (names) => `${names.join(", ")} still to answer`,
    saveNote: (names) => `${names.length} answer${names.length > 1 ? "s" : ""} still needed for ${names.join(", ")}`,
    saveLabels: { idle: "Save our reply", saving: "Saving…", error: "Try saving again", conflict: "Latest reply needed" },
    loadLatest: "Load latest saved reply",
    receiptAria: "RSVP confirmation",
    receiptTitle: (name) => `Reply confirmed for ${name}`,
    receiptAttending: (names) => `${names.join(" and ")} will join us on 20 June 2027.`,
    receiptDeclined: "We will miss you, and we are grateful you let us know.",
    receiptMealsOpen: { pre: "The menu is open.", link: "Choose a meal for each guest", post: "with this same invitation." },
    receiptMealsLater: "Closer to the day we will open the menu. Come back with this same personal link to choose a meal for each guest.",
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
    bodyPre: "There is nothing to do here just yet. Dinner choices open in ",
    bodyMonth: "October",
    bodyPost: ", and you will return to this same invitation to choose a meal for each guest.",
    pill: "Menu opens later this year",
    foot: "For now, please just let us know who is coming.",
  },
  program: {
    title: "How the day unfolds",
    sub: "The day begins with a Bulgarian ritual you wouldn't want to miss.",
    stops: [
      { time: "15:00", name: "Arrival", desc: "The stealing of the bride, a Bulgarian tradition you won't want to miss. Be on time; it starts at 15:30, and there's something cold to drink while you wait." },
      { time: "16:30", name: "Ceremony", desc: "Our vows among the vines." },
      { time: "17:30", name: "Drinks", desc: "A glass of the estate's own wine, something to eat, and the best view on the property." },
      { time: "19:30", name: "Dinner", desc: "Your chosen dish, a few Bulgarian traditions, and no shortage of wine. Menu choices open in October." },
      { time: "21:00", name: "Dancing", desc: "Our favourite songs and at least one hora. No experience needed, hold hands and follow whoever's on your right." },
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
    titleLines: ["Accommodation &", "the Venue itself"],
    body: [
      "Midalidare Estate is a picturesque wine estate nestled among the forests of Sredna Gora, with two wineries and four vineyards stretching across 160 hectares. Accommodation is available in the beautifully restored 200-year-old schoolhouse, now home to Midalidare Hotel & SPA, as well as in charming nearby guest houses. The estate also features a spa and gastropub.",
      "Once you RSVP, we'll arrange your accommodation either on the estate or nearby.",
    ],
    foot: "Heading home the same night? There is free parking on the estate.",
  },
  story: {
    eyebrow: "Our love story",
    titleLines: ["A story", "in bloom"],
    milestones: [
      { label: "Where It All Began", text: "We met in the summer of 2015, while we were both still in high school, and it didn't take long for something special to begin." },
      { label: "Vienna", text: "We moved to Vienna together." },
      { label: "London", text: "We set London as our next adventure." },
      { label: "The big question", text: "She said yes." },
    ],
    finale: "and 2027, the part with all of you in it",
    photoAlt: "Ekaterina and Dimitar",
  },
  footer: {
    thanks: "Thank you for being part of our story.",
    tagline: "We cannot wait to celebrate among the vines with you.",
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
  meta: { title: "Екатерина и Димитър | 20 юни 2027" },
  names: { her: "Екатерина", him: "Димитър", coupleAria: "Екатерина и Димитър" },
  toggle: { aria: "Език" },
  gate: {
    eyebrow: "Лична покана",
    titles: {
      checking: "Отваряме личната ви покана…",
      missing: "Тази покана има личен адрес.",
      invalid: "Не успяхме да отворим поканата.",
      unavailable: "Градината на поканата си почива.",
    },
    messages: {
      checking: "Малко търпение, докато поканата на вашето семейство разцъфне.",
      missing: "Моля, използвайте личния линк, изпратен на вашето семейство. Той отваря поканата ви директно, само с хората, поканени с вас.",
      invalid: "Линкът може да е непълен или остарял. Помолете Екатерина или Димитър да изпратят отново личната ви покана.",
      unavailable: "Проверете връзката и опитайте отново след малко. Поканата и запазеният ви отговор са в безопасност.",
    },
    retry: "Опитай линка отново",
    privacy: "Използваме данните от поканата и отговора ви само за организацията на сватбата. Данните за гостите ще бъдат изтрити до 27 юни 2027 г.",
    footer: "Мидалидаре Естейт · България",
  },
  guest: {
    statusAttending: "С радост ще присъства",
    statusDeclined: "Няма да може да дойде",
    statusPending: "Изберете отговор по-долу",
    yes: "Ще присъства",
    no: "Няма да присъства",
    notesLabel: "Хранителни ограничения или специални нужди",
    notesPlaceholder: "По желание, кажете ни какво ще ви е от помощ",
    attendanceAria: (name) => `Отговор за ${name}`,
  },
  contacts: { prompt: "Предпочитате да отговорите лично?", aria: "Начини за връзка", phone: "Обадете се" },
  nav: { aria: "Навигация в поканата", rsvp: "Отговор" },
  hero: {
    eyebrow: "Празнувайте с нас",
    subtitle: "венчаваме се сред лозята",
    dateAria: "Дата и място на сватбата",
    day: "Неделя",
    dateLong: "20 юни 2027",
    venueName: "Мидалидаре Естейт",
    venueCountry: "България",
    daysToGo: (n) => (n === 1 ? "Остава 1 ден" : `Остават ${n} дни`),
    replyBy: "Молим, отговорете до 1 декември 2026 г.",
    scrollPrompt: "Вашата покана",
  },
  rsvp: {
    greeting: (name) => `Скъпи ${name}`,
    introTitleLines: ["Ще се радваме да", "празнуваме с вас."],
    introBody: "Молим, кажете ни дали ще можете да дойдете.",
    kindly: "Молим, отговорете",
    replyDate: "До 1 декември 2026 г.",
    progressAnswered: (answered, total) => `Отговорени: ${answered} от ${total}`,
    progressOutstanding: (names) => `Очакваме отговор за: ${names.join(", ")}`,
    saveNote: (names) => `Остава отговор за ${names.join(", ")}`,
    saveLabels: { idle: "Запази отговора ни", saving: "Запазваме…", error: "Опитай отново", conflict: "Нужен е последният отговор" },
    loadLatest: "Зареди последния запазен отговор",
    receiptAria: "Потвърждение на отговора",
    receiptTitle: (name) => `Отговорът на ${name} е потвърден`,
    receiptAttending: (names) => `${names.join(" и ")} ще ${names.length === 1 ? "бъде" : "бъдат"} с нас на 20 юни 2027 г.`,
    receiptDeclined: "Ще ни липсвате. Благодарим, че ни казахте.",
    receiptMealsOpen: { pre: "Менюто е отворено.", link: "Изберете ястие за всеки гост", post: "със същата покана." },
    receiptMealsLater: "По-близо до датата ще отворим менюто. Върнете се със същия личен линк, за да изберете ястие за всеки гост.",
  },
  mealTeaser: {
    eyebrow: "Сватбената трапеза",
    title: "Изборът на меню е отворен",
    body: "Изберете ястие за всеки присъстващ гост чрез същата лична покана.",
    btn: "Избери меню",
  },
  mealNotice: {
    aria: "Избор на меню",
    eyebrow: "Сватбената трапеза",
    titleLines: ["Менюто още", "узрява"],
    bodyPre: "Засега тук няма нищо за правене. Изборът на ястия отваря през ",
    bodyMonth: "октомври",
    bodyPost: ". Тогава ще се върнете към същата покана, за да изберете ястие за всеки гост.",
    pill: "Менюто отваря по-късно тази година",
    foot: "Засега просто ни кажете кой ще дойде.",
  },
  program: {
    title: "Как ще протече денят",
    sub: "Денят започва с български ритуал, който не бихте искали да пропуснете.",
    stops: [
      { time: "15:00", name: "Пристигане", desc: "Открадването на булката, българска традиция, която не се пропуска. Бъдете навреме: започва в 15:30, а докато чакате, ще има нещо студено за пиене." },
      { time: "16:30", name: "Церемония", desc: "Нашите обети сред лозята." },
      { time: "17:30", name: "Коктейл", desc: "Чаша вино от имението, нещо за хапване и най-хубавата гледка наоколо." },
      { time: "19:30", name: "Вечеря", desc: "Избраното от вас ястие, няколко български традиции и вино в изобилие. Изборът на меню отваря през октомври." },
      { time: "21:00", name: "Танци", desc: "Любимите ни песни и поне едно хоро. Опит не е нужен. Хванете се за ръце и следвайте човека вдясно." },
    ],
  },
  venue: {
    eyebrow: "Празникът",
    mapTitle: "Карта на Google с Мидалидаре Естейт в Могилово, България",
    captionLabel: "Нашето място",
    captionName: "Мидалидаре Естейт",
    captionPlace: "Могилово, България",
    mapsLink: "Отвори в Google Maps",
    sceneAria: "Абстрактна градинска гледка от Мидалидаре Естейт, от топъл следобед до празник под звездите",
    sceneName: "Мидалидаре",
    sceneTag: "Сред българските лозя",
    dressLabel: "Дрескод",
    dressBody: "Елегантно облекло за вечер сред лозята. Елате с това, в което се чувствате най-добре, и си вземете леко яке или шал. Захладнява, щом слънцето залезе.",
  },
  stay: {
    aria: "Настаняване и имението",
    titleLines: ["Настаняване и", "самото имение"],
    body: [
      "Мидалидаре Естейт е живописно винено имение, сгушено сред горите на Средна гора, с две винарни и четири лозя, разпрострени върху 160 хектара. Настаняването е в красиво реставрираната 200-годишна училищна сграда, в която днес се помещава Midalidare Hotel & SPA, както и в очарователни къщи за гости наблизо. Имението разполага също със спа и гастропъб.",
      "Щом отговорите, ще уредим настаняването ви в имението или наблизо.",
    ],
    foot: "Прибирате се същата вечер? В имението има безплатен паркинг.",
  },
  story: {
    eyebrow: "Нашата любовна история",
    titleLines: ["История", "в цъфтеж"],
    milestones: [
      { label: "Където всичко започна", text: "Срещнахме се през лятото на 2015, докато и двамата бяхме още в гимназията, и не след дълго между нас започна нещо специално." },
      { label: "Виена", text: "Преместихме се заедно във Виена." },
      { label: "Лондон", text: "Избрахме Лондон за следващото си приключение." },
      { label: "Големият въпрос", text: "Тя каза „да“." },
    ],
    finale: "и 2027, частта, в която сте всички вие",
    photoAlt: "Екатерина и Димитър",
  },
  footer: {
    thanks: "Благодарим ви, че сте част от нашата история.",
    tagline: "Нямаме търпение да празнуваме с вас сред лозята.",
    sign: "Екатерина и Димитър · 20 юни 2027",
  },
  meals: {
    back: "← Обратно към поканата",
    eyebrow: "Сватбената трапеза",
    introTitleLines: ["Ястие, избрано", "за вас"],
    introBody: "Използвайте същата лична покана, за да изберете за всеки присъстващ гост.",
    closed: {
      eyebrow: "По-късно",
      title: "Менюто още узрява.",
      body: "Засега няма какво да правите. Ще ви известим, когато изборът на ястия отвори. Същата лична покана ще важи.",
      btn: "Обратно към поканата",
    },
    rsvpFirst: { title: "Първо отговорете", body: "Моля, потвърдете кой ще присъства, преди да избирате ястия.", btn: "Към отговора" },
    emptyMenu: "Менюто за този гост още се подготвя.",
    saveLabels: { idle: "Запази избора на меню", saving: "Запазваме…", error: "Опитай отново", conflict: "Нужен е последният избор" },
    loadLatest: "Зареди последния запазен избор",
  },
  status: {
    needAnswers: "Моля, изберете отговор за всеки поканен гост.",
    savingReply: "Запазваме отговора ви…",
    replyConflict: "Поканата е била променена от друг телефон. Заредете последния запазен отговор и го прегледайте, преди да запазите отново.",
    replySaved: "Отговорът ви е потвърден. Можете да се върнете със същия личен линк, ако нещо се промени.",
    replySaveFailed: "Не успяхме да запазим отговора. Изборът ви е записан на този телефон. Моля, опитайте отново.",
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
