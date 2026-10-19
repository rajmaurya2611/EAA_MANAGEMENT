import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import FirstYearNotes from '../../components/Notes/FirstYearNotes';
import SecondYearNotes from '../../components/Notes/SecondYearNotes';
import ThirdYearNotes from '../../components/Notes/ThirdYearNotes';
import FourthYearNotes from '../../components/Notes/FourthYearNotes';

const { Content } = Layout;

const NewNotes: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('first'); // Default to 1st Year

  const handleMenuClick = ({ key }: { key: string }) => {
    setActiveTab(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ margin: '16px', padding: '20px', background: '#fff', borderRadius: '8px' }}>
        <h1>Notes</h1>
        {/* Horizontal Navbar for 1st, 2nd, 3rd, and 4th Year */}
        <Menu
          mode="horizontal"
          selectedKeys={[activeTab]}
          onClick={handleMenuClick}
          style={{ marginBottom: '20px' }}
        >
          <Menu.Item key="first">1st Year</Menu.Item>
          <Menu.Item key="second">2nd Year</Menu.Item>
          <Menu.Item key="third">3rd Year</Menu.Item>
          <Menu.Item key="fourth">4th Year</Menu.Item>
        </Menu>

        {/* Render respective component based on selected year */}
        {activeTab === 'first' && <FirstYearNotes />}
        {activeTab === 'second' && <SecondYearNotes />}
        {activeTab === 'third' && <ThirdYearNotes />}
        {activeTab === 'fourth' && <FourthYearNotes />}
      </Content>
    </Layout>
  );
};

export default NewNotes;
