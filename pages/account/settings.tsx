import {useEffect, useState} from 'react';
import LoadingView from "../../components/LoadingView";
import {GlobalHead} from "../../components/GlobalHead";
import Layout, {Theme} from "../../components/Layout";
import axios from "../../lib/axios";
import {signOut} from "next-auth/react";
import {CustomNextPage} from "../../components/CustomNextPage";
import {AccountSettings} from "../../lib/responses";

interface ThemeData {
  name: string;
  value: string;
}

const themes = [
  "Dark",
  "Synthwave",
  "Forest",
  "Black",
  "Luxury",
  "Halloween",
  "Business",
  "Dracula",
  "Night",
  "Coffee",
  "Lofi",
  "Cmyk"
];

const themeData: ThemeData[] = themes.map(theme => ({
  name: theme,
  value: theme.toLowerCase(),
}));

function deleteAccount() {
  axios.delete("/settings").then(() => {
    signOut().then(() => {
      window.location.href = "/";
    })
  });
}

const Settings: CustomNextPage = () => {
  const [userData, setUserData] = useState<AccountSettings>()

  useEffect(() => {
    if (!userData) {
      axios.get('/settings').then(res => {
        setUserData(res.data)
      })
    }
  }, [userData])

  if (userData) {
    if (!userData.settings) {
      userData.settings = {}
    }

    return (
        <>
          <GlobalHead/>
          <Layout>
            <main className="container p-2">
              <h1 className="font-bold text-2xl">Settings</h1>
              <form action="/api/backend/settings" method="POST" /*onSubmit={async (e) => {
                e.preventDefault();

                const formData = new FormData(e.currentTarget);

                formData.set()

                console.log(formData);
              }}*/>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Your Email</span>
                  </label>
                  <label className="input-group">
                    <span>Email</span>
                    <input id="input-email" disabled type="text" value={userData.email} placeholder="you@example.com"
                           className="input input-bordered"/>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Your Name</span>
                  </label>
                  <label className="input-group">
                    <span>Name</span>
                    <input id="input-name" name="username" type="text" defaultValue={userData.name}
                           placeholder="SomeUsername"
                           className="input input-bordered"/>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Your bio</span>
                  </label>
                  <textarea id="input-bio" name="bio" className="textarea textarea-bordered h-24"
                            defaultValue={userData.settings.bio}
                            placeholder="Write your bio here..."></textarea>
                </div>

                <div className="form-control">
                  <label className="label cursor-pointer max-w-[12rem]">
                    <span className="label-text">Email Notifications</span>
                    <input id="input-emailNotifications" name="emailNotifications" type="checkbox"
                           className="checkbox checkbox-primary"
                           defaultChecked={userData.settings.emailNotifications}/>
                  </label>
                </div>

                <Theme.Consumer>
                  {({theme, setTheme}) => (
                      <div className="form-control w-full max-w-xs">
                        <label className="label">
                          <span className="label-text">Theme</span>
                        </label>
                        <select id="input-theme" value={theme} name="theme" className="select select-bordered"
                                onChange={(event) => {
                                  setTheme(event.target.value)
                                }}>
                          {themeData.map(({name, value}) => (
                              <option key={value} value={value}>{name}</option>
                          ))}
                        </select>
                      </div>
                  )}
                </Theme.Consumer>

                <div className="form-control">
                  <div>
                    <input type="submit" className="btn btn-primary mt-6" value="Submit"/>
                  </div>
                </div>
              </form>
              <label htmlFor="delete-modal" className="btn btn-error modal-button mt-6">Delete Account</label>
              <input type="checkbox" id="delete-modal" className="modal-toggle"/>
              <div className="modal" id="delete-modal">
                <div className="modal-box">
                  <h3 className="font-bold text-lg">Do you really want to delete your account?</h3>
                  <p className="py-4">This action will delete your entire account and is not revertable.</p>
                  <div className="modal-action">
                    <label htmlFor="delete-modal" className="btn btn-primary">NO</label>
                    <label onClick={deleteAccount} htmlFor="delete-modal" className="btn btn-error">YES</label>
                  </div>
                </div>
              </div>
            </main>
          </Layout>
        </>
    )
  } else {
    return <LoadingView/>
  }
}

Settings.auth = true

// noinspection JSUnusedGlobalSymbols
export default Settings
