import { ReactNode } from "react";
import NavOptions from "./NavOptions";

export default function Drawer({ children }: { children: ReactNode }) {
  return (
    <div className="drawer flex-grow h-full">
      <input id="nav-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content h-full flex flex-col">{children}</div>
      <div className="drawer-side">
        <label htmlFor="nav-drawer" className="drawer-overlay"></label>
        <ul className="menu w-80 h-full bg-base-100 p-4 text-xl font-bold">
          <NavOptions />
        </ul>
      </div>
    </div>
  );
}
