import { Outlet } from "react-router-dom";

// No sub-nav card — Learn is already in the main PeerUp sidebar.
// Each page handles its own navigation (back buttons, tabs, etc.)
export default function LearnLayout() {
  return <Outlet />;
}
