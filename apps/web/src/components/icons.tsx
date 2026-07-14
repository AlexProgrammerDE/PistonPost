import {
  Alert02Icon,
  Add01Icon,
  ArrowDown01Icon,
  ArrowUpRight01Icon,
  Calendar03Icon,
  Cancel01Icon,
  ComputerIcon,
  Copy01Icon,
  Delete02Icon,
  EyeIcon,
  EyeOffIcon,
  FingerPrintIcon,
  Link01Icon,
  Login01Icon,
  Logout01Icon,
  Mail01Icon,
  Menu02Icon,
  Moon02Icon,
  PaintBoardIcon,
  Plug01Icon,
  Settings01Icon,
  Shield01Icon,
  SmartPhone01Icon,
  SquareLock02Icon,
  Sun02Icon,
  Tick02Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  UnfoldMoreIcon,
  Unlink01Icon,
  Upload04Icon,
  UserAdd01Icon,
  UserAccountIcon,
  UserIcon,
  FavouriteIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react"

function createIcon(icon: HugeiconsIconProps["icon"]) {
  return function PistonPostIcon(props: Omit<HugeiconsIconProps, "icon">) {
    return <HugeiconsIcon icon={icon} strokeWidth={2} {...props} />
  }
}

export const CalendarIcon = createIcon(Calendar03Icon)
export const Add = createIcon(Add01Icon)
export const Check = createIcon(Tick02Icon)
export const ChevronDownIcon = createIcon(ArrowDown01Icon)
export const ChevronsUpDown = createIcon(UnfoldMoreIcon)
export const Copy = createIcon(Copy01Icon)
export const Eye = createIcon(EyeIcon)
export const EyeOff = createIcon(EyeOffIcon)
export const Fingerprint = createIcon(FingerPrintIcon)
export const Link2 = createIcon(Link01Icon)
export const Link2Off = createIcon(Unlink01Icon)
export const Lock = createIcon(SquareLock02Icon)
export const LogIn = createIcon(Login01Icon)
export const LogOut = createIcon(Logout01Icon)
export const Mail = createIcon(Mail01Icon)
export const Menu = createIcon(Menu02Icon)
export const Monitor = createIcon(ComputerIcon)
export const Moon = createIcon(Moon02Icon)
export const PaletteIcon = createIcon(PaintBoardIcon)
export const Plug = createIcon(Plug01Icon)
export const Settings = createIcon(Settings01Icon)
export const Shield = createIcon(Shield01Icon)
export const Smartphone = createIcon(SmartPhone01Icon)
export const SquareArrowOutUpRight = createIcon(ArrowUpRight01Icon)
export const Sun = createIcon(Sun02Icon)
export const Trash2 = createIcon(Delete02Icon)
export const ThumbsDown = createIcon(ThumbsDownIcon)
export const ThumbsUp = createIcon(ThumbsUpIcon)
export const Heart = createIcon(FavouriteIcon)
export const TriangleAlert = createIcon(Alert02Icon)
export const Upload = createIcon(Upload04Icon)
export const User2 = createIcon(UserIcon)
export const UserRoundCog = createIcon(UserAccountIcon)
export const UserPlus2 = createIcon(UserAdd01Icon)
export const X = createIcon(Cancel01Icon)
