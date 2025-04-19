import React, { useEffect, useState } from 'react';
import { Table, Tag, Typography, Spin, message } from 'antd';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue } from 'firebase/database';
import CryptoJS from 'crypto-js';

const { Title } = Typography;

const AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY;

interface JoinApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  college: string;
  year: string;
  date: string;
  reason: string;
  skills: string[];
}

const decryptAES = (cipherText: string): string => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const decrypted = CryptoJS.AES.decrypt(cipherText.trim(), key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Decryption failed:', error);
    return cipherText;
  }
};

const JoinTeamApplications: React.FC = () => {
  const [applications, setApplications] = useState<JoinApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applicationsRef = dbRef(db, 'version12/join_team_applications');
    const unsubscribe = onValue(applicationsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsed: JoinApplication[] = Object.entries(data).map(([id, item]: any) => ({
          id,
          fullName: decryptAES(item.fullName),
          email: decryptAES(item.email),
          phone: decryptAES(item.phone),
          college: decryptAES(item.college),
          year: decryptAES(item.year),
          date: decryptAES(item.date),
          reason: decryptAES(item.reason),
          skills: item.skills?.map((s: string) => decryptAES(s)) || [],
        }));
        setApplications(parsed);
      } else {
        setApplications([]);
      }
      setLoading(false);
    }, (error) => {
      message.error('Failed to fetch applications');
      console.error(error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const columns = [
    { title: 'Full Name', dataIndex: 'fullName', key: 'fullName' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'College', dataIndex: 'college', key: 'college' },
    { title: 'Year', dataIndex: 'year', key: 'year' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason' },
    {
      title: 'Skills',
      dataIndex: 'skills',
      key: 'skills',
      render: (skills: string[]) => (
        <>
          {skills.map((skill, index) => (
            <Tag color="blue" key={index}>
              {skill}
            </Tag>
          ))}
        </>
      ),
    },
  ];

  return (
    <div style={{ margin: 24 }}>
      <Title level={3}>Join Team Applications</Title>
      {loading ? (
        <Spin size="large" />
      ) : (
        <Table
          dataSource={applications}
          columns={columns}
          rowKey="id"
          bordered
          pagination={{ pageSize: 5 }}
        />
      )}
    </div>
  );
};

export default JoinTeamApplications;
