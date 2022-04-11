import {ReactNode} from "react";
import NavBar from "./NavBar";
import Drawer from "./Drawer";

export default function Layout({children}: { children: ReactNode }) {
    return (
        <div className="min-h-screen min-w-screen">
          <Drawer>
            <NavBar/>
            {children}
          </Drawer>
        </div>
    )
}
