import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import FirstYearVideoLectures from './FirstYearVideoLectures';
import SecondYearVideoLectures from './SecondYearVideoLectures';
import ThirdYearVideoLectures from './ThirdYearVideoLectures';
import FourthYearVideoLectures from './FourthYearVideoLectures';

const { Content } = Layout;

const NewLectures: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('first'); // Default to 1st Year

  const handleMenuClick = ({ key }: { key: string }) => {
    setActiveTab(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content style={{ margin: '16px', padding: '20px', background: '#fff', borderRadius: '8px' }}>
        <h1>Video Lectures</h1>
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

        {activeTab === 'first' && <FirstYearVideoLectures />}
        {activeTab === 'second' && <SecondYearVideoLectures />}
        {activeTab === 'third' && <ThirdYearVideoLectures />}
        {activeTab === 'fourth' && <FourthYearVideoLectures />}
      </Content>
    </Layout>
  );
};

export default NewLectures;
