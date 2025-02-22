const { Telegraf } = require("telegraf");
const { getReward, getEthPrice } = require("./apis");
const { selectGpuButtons, selectLanguageButtons } = require("./buttons");
const { TELEGRAM_TOKEN } = require("./environment");
const LocalSession = require("telegraf-session-local");
const { i18n } = require("./translations");
const { supported_gpus, getGpu } = require("./supported_gpus");

const bot = new Telegraf(TELEGRAM_TOKEN);
bot.use(i18n.middleware());

const property = "data";

const localSession = new LocalSession({
  database: "session_db.json",
  property: "session",
  storage: LocalSession.storageFileAsync,
  format: {
    serialize: (obj) => JSON.stringify(obj, null, 2),
    deserialize: (str) => JSON.parse(str),
  },
  state: { messages: [] },
});

localSession.DB.then((DB) => {
  console.log("Current LocalSession DB:", DB.value());
});

bot.use(localSession.middleware(property));

let ethCurrentRate;
let currentReward;
let revenueResult;
let gpuSelected;

// Options to set forceReply in messages
const opts = {
  reply_markup: { inline_keyboard: selectGpuButtons },
  parse_mode: "Markdown",
};

// Function to get the ETH price
const ethRate = async () => {
  const res = await getEthPrice();
  ethCurrentRate = res.result.ethusd;
};

// Function to get the current block reward
const rewardResult = async () => {
  const res = await getReward();
  currentReward = res[0].reward;
};

// Function to convert exponential number to decimal number
const convertExponentialToDecimal = (exponentialNumber) => {
  const str = exponentialNumber.toString();
  if (str.indexOf("e") !== -1) {
    const exponent = 24;
    const result = exponentialNumber.toFixed(exponent);
    return result;
  } else {
    return exponentialNumber;
  }
};

// Function to calculate the revenue
const calculateRevenue = ({ hashpower }) => {
  let gpuHashrate = Number(hashpower);
  let reward = currentReward * 24;
  let rewardPerDay = convertExponentialToDecimal(reward);
  return (revenueResult = convertExponentialToDecimal(
    rewardPerDay * gpuHashrate
  ));
};

// Start the bot and welcome message
bot.start((ctx) => {
  ctx.reply(
    i18n.t(ctx[property].language, "reply_welcome", {
      user: ctx.chat.first_name,
    })
  );
});

bot.command("help", (ctx) => {
  ctx.reply(i18n.t(ctx[property].language, "reply_help"));
});

// Declare /calculateRoi command, return the inline buttons

bot.command("calculateRoi", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    i18n.t(ctx[property].language, "calculateRoi_selectGpu"),
    {
      reply_markup: {
        inline_keyboard: selectGpuButtons,
      },
    }
  );
});

bot.command("language", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    i18n.t(ctx[property].language, "language_options"),
    {
      reply_markup: {
        inline_keyboard: selectLanguageButtons,
      },
      parse_mode: "Markdown",
    }
  );
});

bot.action("en", (ctx) => {
  ctx[property].language = "en";
  ctx.reply("Selected language: English 🇬🇧");
});

bot.action("es", (ctx) => {
  ctx[property].language = "es";
  ctx.reply("Idioma seleccionado: Español 🇪🇸");
});

bot.action(supported_gpus, (ctx1) => {
  gpuSelected = ctx1.callbackQuery.data;
  ethRate();
  rewardResult();
  ctx1.reply(
    i18n.t(ctx1[property].language, "calculateRoi_selectedGpu", {
      gpumodel: gpuSelected,
    }),
    {
      reply_markup: {
        force_reply: true,
      },
    }
  );
});

bot.on("message", (ctx) => {
  let userResponse = ctx.message.text;

  if (!isNaN(userResponse)) {
    calculateRevenue({ hashpower: getGpu(gpuSelected).gpu_hash_rate });
    let dailyRevenueInUsd =
      parseFloat(revenueResult) * parseFloat(ethCurrentRate);
    let monthlyRevenueInUsdConverted =
      convertExponentialToDecimal(dailyRevenueInUsd) * 30;
    let gpuRoi =
      Number(ctx.message.text) / parseFloat(monthlyRevenueInUsdConverted);
    let fixedRoi = gpuRoi.toFixed(2);

    ctx.reply(
      i18n.t(ctx[property].language, "calculateRoi_result", {
        gpumodel: gpuSelected,
        gpuhashrate: getGpu(gpuSelected).gpu_mhs,
        gpuwatts: getGpu(gpuSelected).gpu_watts,
        gpucost: ctx.message.text,
        gpudailyrevenue: dailyRevenueInUsd.toFixed(2),
        gpumonthlyrevenue: monthlyRevenueInUsdConverted.toFixed(2),
        gpuroi: fixedRoi,
      }),
      {
        reply_markup: {},
        parse_mode: "HTML",
      }
    );
  } else {
    ctx.reply(i18n.t("calculateRoi_error"));
  }
});

bot.launch();
