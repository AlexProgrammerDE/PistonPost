import {createContext, ReactNode, useState} from "react";
import NavBar from "./NavBar";
import Drawer from "./Drawer";

export const Theme = createContext({ theme: "dark", setTheme: (value: string) => {} });

export default function Layout({children}: { children: ReactNode }) {
  const [theme, setTheme] = useState("dark");

  return (
      <Theme.Provider value={{theme, setTheme}}>
        <div data-theme={theme} className="min-h-screen min-w-screen">
          <Drawer>
            <NavBar/>
            {children}
          </Drawer>
        </div>
      </Theme.Provider>
  )
}
