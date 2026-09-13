import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Reference table of the currencies a wallet can be opened in — replaces the two hardcoded
 * ISO 4217 lists (wallets_controller.ts, validators/transfers.ts) and the business wallet
 * validator that accepted any 3-character string.
 *
 * - `decimals` holds the ISO 4217 minor units (XAF 0, USD 2, KWD 3) for display and amount entry.
 *   It does not change how the ledger stores amounts (see Money / pawapay_provider.formatAmount).
 * - `country_code` (ISO 3166-1 alpha-2) drives the wallet logo; null for currencies shared by
 *   several countries (XAF, XOF, …), which get a generated badge instead.
 * - `is_active` decides whether new wallets can be opened in it. Only a curated set is active by
 *   default, plus every currency an existing wallet already uses, so nothing in production breaks.
 *
 * Seeded here rather than in a seeder: deployments only run migrations.
 * Data: ISO 4217 active codes, excluding funds codes, precious metals and testing codes.
 */
type Row = [string, string, number, string, string | null, string | null]

const CURRENCIES: Row[] = [
  ["AED", "784", 2, "United Arab Emirates dirham", "د.إ", "AE"],
  ["AFN", "971", 2, "Afghan afghani", "؋", "AF"],
  ["ALL", "008", 2, "Albanian lek", "L", "AL"],
  ["AMD", "051", 2, "Armenian dram", "֏", "AM"],
  ["AOA", "973", 2, "Angolan kwanza", "Kz", "AO"],
  ["ARS", "032", 2, "Argentine peso", "$", "AR"],
  ["AUD", "036", 2, "Australian dollar", "$", "AU"],
  ["AWG", "533", 2, "Aruban florin", "ƒ", "AW"],
  ["AZN", "944", 2, "Azerbaijani manat", "₼", "AZ"],
  ["BAM", "977", 2, "Bosnia and Herzegovina convertible mark", "KM", "BA"],
  ["BBD", "052", 2, "Barbados dollar", "$", "BB"],
  ["BDT", "050", 2, "Bangladeshi taka", "৳", "BD"],
  ["BHD", "048", 3, "Bahraini dinar", "BD", "BH"],
  ["BIF", "108", 0, "Burundian franc", "FBu", "BI"],
  ["BMD", "060", 2, "Bermudian dollar", "$", "BM"],
  ["BND", "096", 2, "Brunei dollar", "$", "BN"],
  ["BOB", "068", 2, "Boliviano", "Bs", "BO"],
  ["BRL", "986", 2, "Brazilian real", "R$", "BR"],
  ["BSD", "044", 2, "Bahamian dollar", "$", "BS"],
  ["BTN", "064", 2, "Bhutanese ngultrum", "Nu", "BT"],
  ["BWP", "072", 2, "Botswana pula", "P", "BW"],
  ["BYN", "933", 2, "Belarusian ruble", "Br", "BY"],
  ["BZD", "084", 2, "Belize dollar", "$", "BZ"],
  ["CAD", "124", 2, "Canadian dollar", "$", "CA"],
  ["CDF", "976", 2, "Congolese franc", "FC", "CD"],
  ["CHF", "756", 2, "Swiss franc", "CHF", "CH"],
  ["CLP", "152", 0, "Chilean peso", "$", "CL"],
  ["CNY", "156", 2, "Renminbi", "¥", "CN"],
  ["COP", "170", 2, "Colombian peso", "$", "CO"],
  ["CRC", "188", 2, "Costa Rican colon", "₡", "CR"],
  ["CUP", "192", 2, "Cuban peso", "$", "CU"],
  ["CVE", "132", 2, "Cape Verdean escudo", "$", "CV"],
  ["CZK", "203", 2, "Czech koruna", "Kč", "CZ"],
  ["DJF", "262", 0, "Djiboutian franc", "Fdj", "DJ"],
  ["DKK", "208", 2, "Danish krone", "kr", "DK"],
  ["DOP", "214", 2, "Dominican peso", "$", "DO"],
  ["DZD", "012", 2, "Algerian dinar", "DA", "DZ"],
  ["EGP", "818", 2, "Egyptian pound", "E£", "EG"],
  ["ERN", "232", 2, "Eritrean nakfa", "Nfk", "ER"],
  ["ETB", "230", 2, "Ethiopian birr", "Br", "ET"],
  ["EUR", "978", 2, "Euro", "€", "EU"],
  ["FJD", "242", 2, "Fiji dollar", "$", "FJ"],
  ["FKP", "238", 2, "Falkland Islands pound", "£", "FK"],
  ["GBP", "826", 2, "Pound sterling", "£", "GB"],
  ["GEL", "981", 2, "Georgian lari", "₾", "GE"],
  ["GHS", "936", 2, "Ghanaian cedi", "₵", "GH"],
  ["GIP", "292", 2, "Gibraltar pound", "£", "GI"],
  ["GMD", "270", 2, "Gambian dalasi", "D", "GM"],
  ["GNF", "324", 0, "Guinean franc", "FG", "GN"],
  ["GTQ", "320", 2, "Guatemalan quetzal", "Q", "GT"],
  ["GYD", "328", 2, "Guyanese dollar", "$", "GY"],
  ["HKD", "344", 2, "Hong Kong dollar", "$", "HK"],
  ["HNL", "340", 2, "Honduran lempira", "L", "HN"],
  ["HTG", "332", 2, "Haitian gourde", "G", "HT"],
  ["HUF", "348", 2, "Hungarian forint", "Ft", "HU"],
  ["IDR", "360", 2, "Indonesian rupiah", "Rp", "ID"],
  ["ILS", "376", 2, "Israeli new shekel", "₪", "IL"],
  ["INR", "356", 2, "Indian rupee", "₹", "IN"],
  ["IQD", "368", 3, "Iraqi dinar", "ع.د", "IQ"],
  ["IRR", "364", 2, "Iranian rial", "﷼", "IR"],
  ["ISK", "352", 0, "Icelandic króna", "kr", "IS"],
  ["JMD", "388", 2, "Jamaican dollar", "$", "JM"],
  ["JOD", "400", 3, "Jordanian dinar", "JD", "JO"],
  ["JPY", "392", 0, "Japanese yen", "¥", "JP"],
  ["KES", "404", 2, "Kenyan shilling", "KSh", "KE"],
  ["KGS", "417", 2, "Kyrgyzstani som", "сом", "KG"],
  ["KHR", "116", 2, "Cambodian riel", "៛", "KH"],
  ["KMF", "174", 0, "Comoro franc", "CF", "KM"],
  ["KPW", "408", 2, "North Korean won", "₩", "KP"],
  ["KRW", "410", 0, "South Korean won", "₩", "KR"],
  ["KWD", "414", 3, "Kuwaiti dinar", "KD", "KW"],
  ["KYD", "136", 2, "Cayman Islands dollar", "$", "KY"],
  ["KZT", "398", 2, "Kazakhstani tenge", "₸", "KZ"],
  ["LAK", "418", 2, "Lao kip", "₭", "LA"],
  ["LBP", "422", 2, "Lebanese pound", "L£", "LB"],
  ["LKR", "144", 2, "Sri Lankan rupee", "Rs", "LK"],
  ["LRD", "430", 2, "Liberian dollar", "$", "LR"],
  ["LSL", "426", 2, "Lesotho loti", "L", "LS"],
  ["LYD", "434", 3, "Libyan dinar", "LD", "LY"],
  ["MAD", "504", 2, "Moroccan dirham", "DH", "MA"],
  ["MDL", "498", 2, "Moldovan leu", "L", "MD"],
  ["MGA", "969", 2, "Malagasy ariary", "Ar", "MG"],
  ["MKD", "807", 2, "Macedonian denar", "ден", "MK"],
  ["MMK", "104", 2, "Myanmar kyat", "K", "MM"],
  ["MNT", "496", 2, "Mongolian tögrög", "₮", "MN"],
  ["MOP", "446", 2, "Macanese pataca", "P", "MO"],
  ["MRU", "929", 2, "Mauritanian ouguiya", "UM", "MR"],
  ["MUR", "480", 2, "Mauritian rupee", "₨", "MU"],
  ["MVR", "462", 2, "Maldivian rufiyaa", "Rf", "MV"],
  ["MWK", "454", 2, "Malawian kwacha", "MK", "MW"],
  ["MXN", "484", 2, "Mexican peso", "$", "MX"],
  ["MYR", "458", 2, "Malaysian ringgit", "RM", "MY"],
  ["MZN", "943", 2, "Mozambican metical", "MT", "MZ"],
  ["NAD", "516", 2, "Namibian dollar", "$", "NA"],
  ["NGN", "566", 2, "Nigerian naira", "₦", "NG"],
  ["NIO", "558", 2, "Nicaraguan córdoba", "C$", "NI"],
  ["NOK", "578", 2, "Norwegian krone", "kr", "NO"],
  ["NPR", "524", 2, "Nepalese rupee", "Rs", "NP"],
  ["NZD", "554", 2, "New Zealand dollar", "$", "NZ"],
  ["OMR", "512", 3, "Omani rial", "ر.ع.", "OM"],
  ["PAB", "590", 2, "Panamanian balboa", "B/.", "PA"],
  ["PEN", "604", 2, "Peruvian sol", "S/", "PE"],
  ["PGK", "598", 2, "Papua New Guinean kina", "K", "PG"],
  ["PHP", "608", 2, "Philippine peso", "₱", "PH"],
  ["PKR", "586", 2, "Pakistani rupee", "Rs", "PK"],
  ["PLN", "985", 2, "Polish złoty", "zł", "PL"],
  ["PYG", "600", 0, "Paraguayan guaraní", "₲", "PY"],
  ["QAR", "634", 2, "Qatari riyal", "QR", "QA"],
  ["RON", "946", 2, "Romanian leu", "lei", "RO"],
  ["RSD", "941", 2, "Serbian dinar", "дин", "RS"],
  ["RUB", "643", 2, "Russian ruble", "₽", "RU"],
  ["RWF", "646", 0, "Rwandan franc", "FRw", "RW"],
  ["SAR", "682", 2, "Saudi riyal", "SR", "SA"],
  ["SBD", "090", 2, "Solomon Islands dollar", "$", "SB"],
  ["SCR", "690", 2, "Seychelles rupee", "₨", "SC"],
  ["SDG", "938", 2, "Sudanese pound", "LS", "SD"],
  ["SEK", "752", 2, "Swedish krona", "kr", "SE"],
  ["SGD", "702", 2, "Singapore dollar", "$", "SG"],
  ["SHP", "654", 2, "Saint Helena pound", "£", "SH"],
  ["SLE", "925", 2, "Sierra Leonean leone", "Le", "SL"],
  ["SOS", "706", 2, "Somali shilling", "Sh", "SO"],
  ["SRD", "968", 2, "Surinamese dollar", "$", "SR"],
  ["SSP", "728", 2, "South Sudanese pound", "£", "SS"],
  ["STN", "930", 2, "São Tomé and Príncipe dobra", "Db", "ST"],
  ["SVC", "222", 2, "Salvadoran colón", "₡", "SV"],
  ["SYP", "760", 2, "Syrian pound", "£", "SY"],
  ["SZL", "748", 2, "Swazi lilangeni", "E", "SZ"],
  ["THB", "764", 2, "Thai baht", "฿", "TH"],
  ["TJS", "972", 2, "Tajikistani somoni", "SM", "TJ"],
  ["TMT", "934", 2, "Turkmenistan manat", "m", "TM"],
  ["TND", "788", 3, "Tunisian dinar", "DT", "TN"],
  ["TOP", "776", 2, "Tongan paʻanga", "T$", "TO"],
  ["TRY", "949", 2, "Turkish lira", "₺", "TR"],
  ["TTD", "780", 2, "Trinidad and Tobago dollar", "$", "TT"],
  ["TWD", "901", 2, "New Taiwan dollar", "$", "TW"],
  ["TZS", "834", 2, "Tanzanian shilling", "TSh", "TZ"],
  ["UAH", "980", 2, "Ukrainian hryvnia", "₴", "UA"],
  ["UGX", "800", 0, "Ugandan shilling", "USh", "UG"],
  ["USD", "840", 2, "United States dollar", "$", "US"],
  ["UYU", "858", 2, "Uruguayan peso", "$", "UY"],
  ["UZS", "860", 2, "Uzbekistani sum", "soʻm", "UZ"],
  ["VED", "926", 2, "Venezuelan digital bolívar", "Bs.D", "VE"],
  ["VES", "928", 2, "Venezuelan sovereign bolívar", "Bs.S", "VE"],
  ["VND", "704", 0, "Vietnamese đồng", "₫", "VN"],
  ["VUV", "548", 0, "Vanuatu vatu", "VT", "VU"],
  ["WST", "882", 2, "Samoan tālā", "T", "WS"],
  ["XAF", "950", 0, "Central African CFA franc", "FCFA", null],
  ["XCD", "951", 2, "East Caribbean dollar", "$", null],
  ["XCG", "532", 2, "Caribbean guilder", "Cg", null],
  ["XOF", "952", 0, "West African CFA franc", "CFA", null],
  ["XPF", "953", 0, "CFP franc", "₣", null],
  ["YER", "886", 2, "Yemeni rial", "﷼", "YE"],
  ["ZAR", "710", 2, "South African rand", "R", "ZA"],
  ["ZMW", "967", 2, "Zambian kwacha", "K", "ZM"],
  ["ZWG", "924", 2, "Zimbabwe Gold", "ZiG", "ZW"],
]

const DEFAULT_ACTIVE = ["USD", "EUR", "GBP", "CDF", "XAF", "XOF", "RWF", "BIF", "KES", "UGX", "TZS", "ZMW", "MWK", "NGN", "GHS", "ZAR", "MZN", "SLE"]

export default class extends BaseSchema {
  protected tableName = 'currencies'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('code', 3).primary()
      table.string('numeric_code', 3).nullable()
      table.string('name', 100).notNullable()
      table.string('symbol', 10).nullable()
      table.smallint('decimals').notNullable().defaultTo(2)
      table.string('country_code', 2).nullable()
      table.string('logo_url', 500).nullable()
      table.boolean('is_active').notNullable().defaultTo(false)
      table.integer('sort_order').notNullable().defaultTo(1000)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.raw(
      `ALTER TABLE ${this.tableName}
         ADD CONSTRAINT currencies_code_format CHECK (code ~ '^[A-Z]{3}$'),
         ADD CONSTRAINT currencies_decimals_range CHECK (decimals BETWEEN 0 AND 4)`
    )
    this.schema.raw(`CREATE INDEX currencies_active_sort_idx ON ${this.tableName} (is_active, sort_order)`)

    this.defer(async (db) => {
      const now = new Date()
      await db.table(this.tableName).insert(
        CURRENCIES.map(([code, numericCode, decimals, name, symbol, countryCode]) => {
          const position = DEFAULT_ACTIVE.indexOf(code)
          return {
            code,
            numeric_code: numericCode,
            name,
            symbol,
            decimals,
            country_code: countryCode,
            is_active: position !== -1,
            sort_order: position === -1 ? 1000 : (position + 1) * 10,
            created_at: now,
            updated_at: now,
          }
        })
      )

      // Never lock an existing wallet out of its own currency
      await db.rawQuery(
        `UPDATE ${this.tableName} SET is_active = true
          WHERE code IN (SELECT DISTINCT currency_code FROM wallets)`
      )
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
