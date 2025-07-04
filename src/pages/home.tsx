import React, { useState } from 'react';
import {
  UserOutlined,
  VideoCameraOutlined,
  AppstoreAddOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  PlusOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Layout, Menu, theme } from 'antd';
import Dashboard from '../components/dashboard';
import Carousel from '../components/Carousel/Carousel';
import NewNotes from '../components/Notes/NewNotes';
import NewQuantums from '../components/Quantums/NewQuantums';
import NewPYQ from '../components/PYQs/NewPYQ';
import NewSyllabus from "../components/Syllabus/NewSyllabus";
import ManageNotes from '../components/Notes/ManageNotes';
import ManageQuantum from '../components/Quantums/ManageQuantums';
import ManageSyllabus from '../components/Syllabus/ManageSyllabus';
import ManagePYQs from '../components/PYQs/ManagePYQ';
import UserRequestedNotes from '../components/UserRequests/UserRequestedNotes';
import UserRequestedQuantums from '../components/UserRequests/UserRequestedQuantums';
import UserRequestedPYQs from '../components/UserRequests/UserRequestedPyqs';
import UserRequestedRoadmaps from '../components/UserRequests/UserRequestedRoadmaps';
import UserRequestedSyllabus from '../components/UserRequests/UserRequestedSyllabus';
import UsersVersion12 from '../components/Users/UsersVersion12';
import UsersOld from '../components/Users/UsersOld';
import Roadmap from '../components/Roadmap/roadmap';
import InterviewQuestions from '../components/Interview_Question/interview_question';
import AptitudePractice from '../components/Aptitude_Practice/aptitude_practice';
import PlacementNotes from '../components/Placement_Notes/placement_notes';
import Opportunities from '../components/Opportunities/opportunities';
import NewEBooks from '../components/E-Book/NewEBooks';
import ManageEBooks from '../components/E-Book/ManageEBooks';
import InfoCards from '../components/Info_Cards/infoCards';
import JoinTeamApplications from '../components/JoinTeamApplication/joinTeamApplication';
import ManageUserContributedNotes from '../components/UserContributions/UserContributedNotes';
import ManageUserContributedEbooks from '../components/UserContributions/UserContributedEbooks';
import ManageUserContributedQuantums from '../components/UserContributions/UserContributedQuantum';
import ManageUserContributedPyqs from '../components/UserContributions/UserContributedPyqs';
import ManageUserContributedSyllabus from '../components/UserContributions/UserContributedSyllabus';
import Events from '../components/Events_homepage/events';
import NewLectures from '../components/VideoLectures/NewVideoLectures';
import ManageLectures from '../components/VideoLectures/ManageVideoLectures';
import UserRequestedLectures from '../components/UserRequests/UserRequestedVideoLectures';
import UserFeedbacks from '../components/Feedback/Feedback';

const { Content, Sider } = Layout;
const { SubMenu } = Menu;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  children?: NavItem[];
}

const Home: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('dashboard');

  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const navItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <UserOutlined /> },
    {
      key: 'Users',
      label: 'Users',
      icon: <VideoCameraOutlined />,
      children: [
        { key: 'usersV12', label: 'Version 12', icon: <UserOutlined /> },
        { key: 'usersOld', label: 'Old Version', icon: <UserOutlined /> },
      ],
    },
    {
      key: 'Homepage',
      label: 'Homepage',
      icon: <VideoCameraOutlined />,
      children: [
        { key: 'carousel', label: 'Carousel', icon: <AppstoreAddOutlined /> },
        { key: 'events', label: 'Events', icon: <AppstoreAddOutlined /> },
        { key: 'infoCards', label: 'Info Cards', icon: <AppstoreAddOutlined /> },
        { key: 'jointeamappliactions', label: 'Join Team Application', icon: <AppstoreAddOutlined /> },
        { key: 'userFeedback', label: 'User Feedbacks', icon: <AppstoreAddOutlined /> },
      ],
    },
    {
      key: 'materials',
      label: 'Materials',
      icon: <AppstoreOutlined />,
      children: [
        {
          key: 'notes',
          label: 'Notes',
          icon: <FileTextOutlined />,
          children: [
            { key: 'notesNew', label: 'New', icon: <PlusOutlined /> },
            { key: 'notesManage', label: 'Manage', icon: <EditOutlined /> },
          ],
        },
        {
          key: 'quantum',
          label: 'Quantum',
          icon: <AppstoreOutlined />,
          children: [
            { key: 'quantumNew', label: 'New', icon: <PlusOutlined /> },
            { key: 'quantumManage', label: 'Manage', icon: <EditOutlined /> },
          ],
        },
        {
          key: 'pyqs',
          label: 'PYQs',
          icon: <AppstoreOutlined />,
          children: [
            { key: 'pyqNew', label: 'New', icon: <PlusOutlined /> },
            { key: 'pyqManage', label: 'Manage', icon: <EditOutlined /> },
          ],
        },
        {
          key: 'syllabus',
          label: 'Syllabus',
          icon: <AppstoreOutlined />,
          children: [
            { key: 'syllabusNew', label: 'New', icon: <PlusOutlined /> },
            { key: 'syllabusManage', label: 'Manage', icon: <EditOutlined /> },
          ],
        },
        {
          key: 'E-book',
          label: 'E-Books',
          icon: <FileTextOutlined />,
          children: [
            { key: 'booksNew', label: 'New', icon: <PlusOutlined /> },
            { key: 'booksManage', label: 'Manage', icon: <EditOutlined /> },
          ],
        },
         {
          key: 'lectures',
          label: 'Lectures',
          icon: <FileTextOutlined />,
          children: [
            { key: 'lecturesNew', label: 'New', icon: <PlusOutlined /> },
            { key: 'lecturesManage', label: 'Manage', icon: <EditOutlined /> },
          ],
        },
      ],
    },
    {
      key: 'usercontributions',
      label: 'User Contributions',
      icon: <UserOutlined />,
      children: [
        { key: 'userContributedNotes', label: 'Notes', icon: <FileTextOutlined /> },
        { key: 'userContributedEbooks', label: 'E-Books', icon: <FileTextOutlined /> },
        { key: 'userContributedPYQs', label: 'PYQs', icon: <AppstoreOutlined /> },
        { key: 'userContributedQuantum', label: 'Quantum', icon: <AppstoreOutlined /> },
        { key: 'userContributedSyllabus', label: 'Syllabus', icon: <AppstoreOutlined /> },
      ],
    },
    {
      key: 'userRequests',
      label: 'User Requests',
      icon: <UserOutlined />,
      children: [
        { key: 'userReqNotes', label: 'Notes', icon: <FileTextOutlined /> },
        { key: 'userReqPYQs', label: 'PYQs', icon: <AppstoreOutlined /> },
        { key: 'userReqQuantum', label: 'Quantum', icon: <AppstoreOutlined /> },
        { key: 'userReqRoadmaps', label: 'Roadmaps', icon: <AppstoreOutlined /> },
        { key: 'userReqSyllabus', label: 'Syllabus', icon: <AppstoreOutlined /> },
        { key: 'userReqLectures', label: 'Lectures', icon: <AppstoreOutlined /> },
      ],
    },
    {
      key: 'placement',
      label: 'Placement',
      icon: <VideoCameraOutlined />,
      children: [
        { key: 'aptitude_practice', label: 'Aptitude Practice', icon: <AppstoreAddOutlined /> },
        { key: 'interview_questions', label: 'Interview Questions', icon: <AppstoreAddOutlined /> },
        { key: 'roadmap', label: 'Roadmap', icon: <AppstoreAddOutlined /> },
        { key: 'placement_notes', label: 'Placement Notes', icon: <AppstoreAddOutlined /> },
        { key: 'opportunities', label: 'Opportunities', icon: <AppstoreAddOutlined /> },
      ],
    },
  ];

  const handleMenuClick = (key: string) => {
    setActiveView(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ overflowY: 'auto' }}
      >
        <div className="demo-logo-vertical" />
        <Menu
          theme="dark"
          defaultSelectedKeys={['dashboard']}
          mode="inline"
          onClick={({ key }) => handleMenuClick(key)}
        >
          {navItems.map((item) =>
            item.children ? (
              <SubMenu key={item.key} icon={item.icon} title={item.label}>
                {item.children.map((subItem) =>
                  subItem.children ? (
                    <SubMenu key={subItem.key} icon={subItem.icon} title={subItem.label}>
                      {(subItem.children as NavItem[]).map((child: NavItem) => (
                        <Menu.Item key={child.key} icon={child.icon}>
                          {child.label}
                        </Menu.Item>
                      ))}
                    </SubMenu>
                  ) : (
                    <Menu.Item key={subItem.key} icon={subItem.icon}>
                      {subItem.label}
                    </Menu.Item>
                  )
                )}
              </SubMenu>
            ) : (
              <Menu.Item key={item.key} icon={item.icon}>
                {item.label}
              </Menu.Item>
            )
          )}
        </Menu>
      </Sider>

      <Layout>
        <Content
          style={{
            margin: '0',
            paddingTop: 0,
            overflowY: 'auto',
            height: '100vh',
          }}
        >
          <div
            style={{
              padding: 0,
              minHeight: 360,
              background: colorBgContainer,
              overflowY: 'auto',
              maxHeight: '100vh',
            }}
          >
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'usersV12' && <UsersVersion12/>}
            {activeView === 'usersOld' && <UsersOld/>}
            {activeView === 'carousel' && <Carousel />}
            {activeView === 'notesNew' && <NewNotes />}
            {activeView === 'notesManage' && <ManageNotes />}
            {activeView === 'quantumNew' && <NewQuantums />}
            {activeView === 'quantumManage' && <ManageQuantum />}
            {activeView === 'pyqNew' && <NewPYQ />}
            {activeView === 'pyqManage' && <ManagePYQs />}
            {activeView === 'syllabusNew' && <NewSyllabus />}
            {activeView === 'syllabusManage' && <ManageSyllabus />}
            {activeView === 'booksNew' && <NewEBooks />}
            {activeView === 'booksManage' && <ManageEBooks/>}
             {activeView === 'lecturesNew' && <NewLectures />}
            {activeView === 'lecturesManage' && <ManageLectures/>}
            {activeView === 'userReqNotes' && <UserRequestedNotes />}
            {activeView === 'userReqPYQs' && <UserRequestedPYQs />}
            {activeView === 'userReqQuantum' && <UserRequestedQuantums />}
            {activeView === 'userReqRoadmaps' && <UserRequestedRoadmaps />}
            {activeView === 'userReqSyllabus' && <UserRequestedSyllabus />}
            {activeView === 'userReqLectures' && <UserRequestedLectures />}
            {activeView === 'aptitude_practice' && <AptitudePractice/>}
            {activeView === 'interview_questions' && <InterviewQuestions/>}
            {activeView === 'roadmap' && <Roadmap/>}
            {activeView === 'placement_notes' && <PlacementNotes/>}
            {activeView === 'opportunities' && <Opportunities/>}
            {activeView === 'infoCards' && <InfoCards/>}
            {activeView === 'events' && <Events/>}
            {activeView === 'jointeamappliactions' && <JoinTeamApplications/>}
            {activeView === 'userContributedNotes' && <ManageUserContributedNotes/>}
            {activeView === 'userContributedEbooks' && <ManageUserContributedEbooks/>}
            {activeView === 'userContributedQuantum' && <ManageUserContributedQuantums/>}
            {activeView === 'userContributedPYQs' && <ManageUserContributedPyqs/>}
            {activeView === 'userContributedSyllabus' && <ManageUserContributedSyllabus/>}
            { activeView === 'userFeedback' && <UserFeedbacks/>}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default Home;


// import React, { useState } from 'react';
// import {
//   UserOutlined,
//   VideoCameraOutlined,
//   AppstoreAddOutlined,
//   FileTextOutlined,
//   AppstoreOutlined,
//   PlusOutlined,
//   EditOutlined,
// } from '@ant-design/icons';
// import { Layout, Menu, theme } from 'antd';
// import Dashboard from '../components/dashboard';
// import Users from './Users';
// import Carousel from './Carousel';
// import NewNotes from '../components/Notes/NewNotes';
// import NewQuantums from '../components/Quantums/NewQuantums';
// import NewPYQ from '../components/PYQs/NewPYQ';
// import NewSyllabus from "../components/Syllabus/NewSyllabus";
// import ManageNotes from '../components/Notes/ManageNotes';
// import ManageQuantum from '../components/Quantums/ManageQuantums';
// import ManageSyllabus from '../components/Syllabus/ManageSyllabus';
// import ManagePYQs from '../components/PYQs/ManagePYQ';
// import UserRequestedNotes from '../components/UserRequests/UserRequestedNotes';
// import UserRequestedQuantums from '../components/UserRequests/UserRequestedQuantums';
// import UserRequestedPYQs from '../components/UserRequests/UserRequestedPyqs';
// import UserRequestedRoadmaps from '../components/UserRequests/UserRequestedRoadmaps';
// import UserRequestedSyllabus from '../components/UserRequests/UserRequestedSyllabus';

// const { Content, Sider } = Layout;
// const { SubMenu } = Menu;

// interface NavItem {
//   key: string;
//   label: string;
//   icon: React.ReactNode;
//   children?: NavItem[];
// }

// const Home: React.FC = () => {
//   const [collapsed, setCollapsed] = useState(false);
//   const [activeView, setActiveView] = useState('dashboard');

//   const {
//     token: { colorBgContainer },
//   } = theme.useToken();

//   const navItems: NavItem[] = [
//     { key: 'dashboard', label: 'Dashboard', icon: <UserOutlined /> },
//     { key: 'Users', label: 'Users', icon: <VideoCameraOutlined /> },
//     {
//       key: 'Homepage',
//       label: 'Homepage',
//       icon: <VideoCameraOutlined />,
//       children: [
//         { key: 'carousel', label: 'Carousel', icon: <AppstoreAddOutlined /> },
//       ],
//     },
//     {
//       key: 'materials',
//       label: 'Materials',
//       icon: <AppstoreOutlined />,
//       children: [
//         {
//           key: 'notes',
//           label: 'Notes',
//           icon: <FileTextOutlined />,
//           children: [
//             { key: 'notesNew', label: 'New', icon: <PlusOutlined /> },
//             { key: 'notesManage', label: 'Manage', icon: <EditOutlined /> },
//           ],
//         },
//         {
//           key: 'quantum',
//           label: 'Quantum',
//           icon: <AppstoreOutlined />,
//           children: [
//             { key: 'quantumNew', label: 'New', icon: <PlusOutlined /> },
//             { key: 'quantumManage', label: 'Manage', icon: <EditOutlined /> },
//           ],
//         },
//         {
//           key: 'pyqs',
//           label: 'PYQs',
//           icon: <AppstoreOutlined />,
//           children: [
//             { key: 'pyqNew', label: 'New', icon: <PlusOutlined /> },
//             { key: 'pyqManage', label: 'Manage', icon: <EditOutlined /> },
//           ],
//         },
//         {
//           key: 'syllabus',
//           label: 'Syllabus',
//           icon: <AppstoreOutlined />,
//           children: [
//             { key: 'syllabusNew', label: 'New', icon: <PlusOutlined /> },
//             { key: 'syllabusManage', label: 'Manage', icon: <EditOutlined /> },
//           ],
//         },
//       ],
//     },
//     {
//       key: 'userRequests',
//       label: 'User Requests',
//       icon: <UserOutlined />,
//       children: [
//         { key: 'userReqNotes', label: 'Notes', icon: <FileTextOutlined /> },
//         { key: 'userReqPYQs', label: 'PYQs', icon: <AppstoreOutlined /> },
//         { key: 'userReqQuantum', label: 'Quantum', icon: <AppstoreOutlined /> },
//         { key: 'userReqRoadmaps', label: 'Roadmaps', icon: <AppstoreOutlined /> },
//         { key: 'userReqSyllabus', label: 'Syllabus', icon: <AppstoreOutlined /> },
//       ],
//     },
//   ];

//   const handleMenuClick = (key: string) => {
//     setActiveView(key);
//   };

//   return (
//     <Layout style={{ minHeight: '100vh' }}>
//       <Sider
//         collapsible
//         collapsed={collapsed}
//         onCollapse={setCollapsed}
//         style={{ overflowY: 'auto' }}
//       >
//         <div className="demo-logo-vertical" />
//         <Menu
//           theme="dark"
//           defaultSelectedKeys={['dashboard']}
//           mode="inline"
//           onClick={({ key }) => handleMenuClick(key)}
//         >
//           {navItems.map((item) =>
//             item.children ? (
//               <SubMenu key={item.key} icon={item.icon} title={item.label}>
//                 {item.children.map((subItem) =>
//                   subItem.children ? (
//                     <SubMenu key={subItem.key} icon={subItem.icon} title={subItem.label}>
//                       {(subItem.children as NavItem[]).map((child: NavItem) => (
//                         <Menu.Item key={child.key} icon={child.icon}>
//                           {child.label}
//                         </Menu.Item>
//                       ))}
//                     </SubMenu>
//                   ) : (
//                     <Menu.Item key={subItem.key} icon={subItem.icon}>
//                       {subItem.label}
//                     </Menu.Item>
//                   )
//                 )}
//               </SubMenu>
//             ) : (
//               <Menu.Item key={item.key} icon={item.icon}>
//                 {item.label}
//               </Menu.Item>
//             )
//           )}
//         </Menu>
//       </Sider>

//       <Layout>
//         <Content
//           style={{
//             margin: '0',
//             paddingTop: 0,
//             overflowY: 'auto',
//             height: '100vh',
//           }}
//         >
//           <div
//             style={{
//               padding: 0,
//               minHeight: 360,
//               background: colorBgContainer,
//               overflowY: 'auto',
//               maxHeight: '100vh',
//             }}
//           >
//             {/* Existing Views */}
//             {activeView === 'dashboard' && <Dashboard />}
//             {activeView === 'Users' && <Users />}
//             {activeView === 'carousel' && <Carousel />}
//             {activeView === 'notesNew' && <NewNotes />}
//             {activeView === 'notesManage' && <ManageNotes />}
//             {activeView === 'quantumNew' && <NewQuantums />}
//             {activeView === 'quantumManage' && <ManageQuantum />}
//             {activeView === 'pyqNew' && <NewPYQ />}
//             {activeView === 'pyqManage' && <ManagePYQs />}
//             {activeView === 'syllabusNew' && <NewSyllabus />}
//             {activeView === 'syllabusManage' && <ManageSyllabus />}

//             {/* New User Request Views (Placeholders for now) */}
//             {activeView === 'userReqNotes' && <UserRequestedNotes/>}
//             {activeView === 'userReqPYQs' && <UserRequestedPYQs/>}
//             {activeView === 'userReqQuantum' && <UserRequestedQuantums/>}
//             {activeView === 'userReqRoadmaps' && <UserRequestedRoadmaps/>}
//             {activeView === 'userReqSyllabus' && <UserRequestedSyllabus/>}
//           </div>
//         </Content>
//       </Layout>
//     </Layout>
//   );
// };

// export default Home;
