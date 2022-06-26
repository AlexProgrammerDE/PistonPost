export function BadgeIcon({
  role,
  className,
  size,
  marginLeft
}: {
  role: string;
  className?: string;
  size?: number;
  marginLeft?: number;
}) {
  const usedSize = size || 7;
  const usedMarginLeft = marginLeft || 4;
  switch (role) {
    case "ADMIN":
      return (
        <svg
          version="1.0"
          xmlns="http://www.w3.org/2000/svg"
          className={`h-${usedSize + 1} w-${
            usedSize + 1
          } text-accent my-auto ml-${usedMarginLeft} text-lg font-bold`}
          fill="currentColor"
          viewBox="0 0 1280.000000 815.000000"
        >
          <title>Admin</title>
          <g transform="translate(0.000000,815.000000) scale(0.100000,-0.100000)">
            <path d="M6224 8131 c-137 -37 -202 -83 -331 -229 -139 -159 -190 -310 -179 -527 9 -184 62 -316 185 -461 38 -44 91 -97 118 -117 55 -40 169 -97 195 -97 9 0 19 -4 22 -9 10 -16 -743 -2610 -779 -2686 -48 -100 -88 -150 -141 -176 -41 -19 -50 -20 -86 -10 -55 17 -124 88 -185 191 -27 47 -343 465 -702 929 l-652 845 46 39 c209 179 315 387 315 617 0 172 -47 303 -159 442 -132 164 -238 240 -389 279 -133 34 -263 18 -402 -49 -58 -28 -93 -55 -159 -122 -136 -139 -209 -256 -242 -390 -17 -71 -17 -249 0 -320 19 -77 81 -207 132 -276 116 -158 250 -254 404 -291 39 -9 71 -17 72 -18 3 -2 -194 -1964 -203 -2020 -12 -74 -54 -192 -84 -233 -75 -104 -178 -97 -335 23 -38 29 -385 259 -770 510 -385 251 -706 463 -713 470 -11 10 -8 21 22 63 142 197 175 498 79 726 -83 199 -274 374 -468 432 -73 21 -217 24 -295 5 -30 -7 -93 -31 -140 -53 -71 -35 -100 -56 -180 -137 -74 -74 -105 -115 -137 -176 -68 -131 -78 -178 -78 -355 0 -135 3 -165 24 -230 98 -314 354 -513 661 -513 109 -1 171 15 268 68 35 20 65 35 67 33 5 -7 275 -516 383 -723 327 -629 481 -1071 562 -1610 6 -38 13 -82 16 -98 l6 -27 4398 0 4397 0 7 52 c12 95 76 400 112 535 77 294 201 611 374 962 103 209 458 890 471 905 4 5 21 -1 37 -13 80 -56 244 -98 346 -87 174 20 302 81 426 206 47 47 100 111 119 142 197 336 129 725 -172 978 -77 65 -183 121 -267 141 -71 17 -200 17 -270 0 -127 -31 -278 -131 -375 -249 -124 -150 -172 -298 -162 -504 7 -163 52 -301 134 -416 25 -36 30 -49 20 -58 -6 -6 -330 -218 -718 -471 -388 -254 -737 -485 -775 -514 -89 -67 -137 -89 -200 -89 -94 0 -157 69 -194 214 -14 57 -48 371 -115 1089 -52 555 -95 1013 -95 1018 0 5 7 9 14 9 38 0 179 54 233 89 118 76 246 231 299 363 69 168 72 395 7 558 -39 98 -87 165 -193 271 -107 107 -188 155 -315 185 -135 31 -299 2 -432 -78 -70 -42 -202 -174 -258 -258 -147 -223 -146 -563 4 -792 49 -76 137 -171 206 -225 l40 -30 -31 -39 c-288 -365 -1292 -1681 -1329 -1743 -56 -93 -138 -175 -185 -184 -77 -16 -158 60 -216 203 -12 30 -76 240 -142 465 -66 226 -238 810 -382 1300 -143 489 -258 895 -256 902 3 7 12 13 20 13 7 0 51 18 96 41 100 50 237 180 294 279 116 199 139 467 59 670 -74 188 -263 377 -432 431 -96 31 -271 36 -367 10z" />
            <path d="M1990 660 l0 -660 4395 0 4395 0 2 660 3 660 -4397 0 -4398 0 0 -660z" />
          </g>
        </svg>
      );
    case "VERIFIED":
      return (
        <svg
          version="1.1"
          viewBox="0,0,24,24"
          fill="currentColor"
          className={`h-${usedSize} w-${usedSize} text-info my-auto ml-${usedMarginLeft} text-lg font-bold`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Verified</title>
          <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
        </svg>
      );
    default:
      return null;
  }
}
