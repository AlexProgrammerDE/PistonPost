import Logo from "../public/logo.webp";
import Image from "next/image";
import NavOptions from "./NavOptions";

export default function NavBar() {
  return (
      <div className="w-full navbar bg-base-300">
        <div className="container">
          <div className="flex-none lg:hidden">
            <label htmlFor="my-drawer-3" className="btn btn-square btn-ghost">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                   className="inline-block w-6 h-6 stroke-current">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </label>
          </div>
          <div className="flex-1 px-2 mx-2">
            <div className="flex flex-row">
              <Image
                  src={Logo}
                  alt="PistonPost Logo"
                  width={40}
                  height={40}
              />
              <p className="my-auto ml-2 font-bold text-xl">
                PistonPost
              </p>
            </div>
          </div>
          <div className="flex-none hidden lg:block">
            <ul className="menu menu-horizontal p-0 font-bold text-xl">
              <NavOptions/>
            </ul>
          </div>
        </div>
      </div>
  )
}
