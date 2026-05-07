/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Dashboard from './pages/Dashboard';
import Streams from './pages/Streams';
import Equipment from './pages/Equipment';
import Collaborations from './pages/Collaborations';
import Media from './pages/Media';
import Clips from './pages/Clips';
import Platforms from './pages/Platforms';
import Analytics from './pages/Analytics';
import Revenue from './pages/Revenue';
import AI from './pages/AI';
import Notifications from './pages/Notifications';
import Team from './pages/Team';
import Settings from './pages/Settings';
import Episodes from './pages/Episodes';
import Shows from './pages/Shows';
import Guests from './pages/Guests';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Login": Login,
    "Register": Register,
    "AuthCallback": AuthCallback,
    "Dashboard": Dashboard,
    "Streams": Streams,
    "Equipment": Equipment,
    "Collaborations": Collaborations,
    "Media": Media,
    "Clips": Clips,
    "Platforms": Platforms,
    "Analytics": Analytics,
    "Revenue": Revenue,
    "AI": AI,
    "Notifications": Notifications,
    "Team": Team,
    "Settings": Settings,
    "Episodes": Episodes,
    "Shows": Shows,
    "Guests": Guests,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};