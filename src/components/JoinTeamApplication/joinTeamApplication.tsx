import React, { useEffect, useState } from 'react';
import {
  Table,
  Tag,
  Typography,
  Spin,
  message,
  Input,
  DatePicker,
  Row,
  Col,
  Select,
  Button,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue } from 'firebase/database';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY;

interface JoinApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  college: string;
  year: string;
  date: string;
  time: string;
  reason: string;
  skills: string[];
  rawDateTime: string;
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
  const [filtered, setFiltered] = useState<JoinApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchName, setSearchName] = useState('');
  const [searchCollege, setSearchCollege] = useState('');
  const [searchYear, setSearchYear] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  useEffect(() => {
    const applicationsRef = dbRef(db, 'version12/join_team_applications');
    const unsubscribe = onValue(
      applicationsRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const parsed: JoinApplication[] = Object.entries(data).map(
            ([id, item]: any) => {
              const fullDate = decryptAES(item.date); // Ex: '2025-04-17 20:58:47'
              const [date, time] = fullDate.split(' ');
              return {
                id,
                fullName: decryptAES(item.fullName),
                email: decryptAES(item.email),
                phone: decryptAES(item.phone),
                college: decryptAES(item.college),
                year: decryptAES(item.year),
                date, // YYYY-MM-DD
                time,
                rawDateTime: fullDate,
                reason: decryptAES(item.reason),
                skills: item.skills?.map((s: string) => decryptAES(s)) || [],
              };
            }
          );

          // Sort by rawDateTime descending to show latest first
          parsed.sort((a, b) =>
            dayjs(b.rawDateTime).unix() - dayjs(a.rawDateTime).unix()
          );

          setApplications(parsed);
          setFiltered(parsed);
        } else {
          setApplications([]);
          setFiltered([]);
        }
        setLoading(false);
      },
      (error) => {
        message.error('Failed to fetch applications');
        console.error(error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let filteredList = applications.filter(
      (app) =>
        app.fullName.toLowerCase().includes(searchName.toLowerCase()) &&
        app.college.toLowerCase().includes(searchCollege.toLowerCase()) &&
        app.year.toLowerCase().includes(searchYear.toLowerCase())
    );

    if (dateRange) {
      const [start, end] = dateRange;
      filteredList = filteredList.filter((app) =>
        dayjs(app.date).isBetween(start, end, 'day', '[]')
      );
    }

    if (selectedSkills.length > 0) {
      filteredList = filteredList.filter((app) =>
        selectedSkills.every((skill) => app.skills.includes(skill))
      );
    }

    setFiltered(filteredList);
  }, [searchName, searchCollege, searchYear, dateRange, selectedSkills, applications]);

  const resetFilters = () => {
    setSearchName('');
    setSearchCollege('');
    setSearchYear('');
    setDateRange(null);
    setSelectedSkills([]);
  };

  const allSkills = Array.from(
    new Set(applications.flatMap((app) => app.skills))
  ).filter(Boolean);

  const columns = [
    { title: 'Full Name', dataIndex: 'fullName', key: 'fullName' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'College', dataIndex: 'college', key: 'college' },
    { title: 'Year', dataIndex: 'year', key: 'year' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Time', dataIndex: 'time', key: 'time' },
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
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3}>Join Team Applications</Title>
        </Col>
        <Col>
          <Text strong>Total: {filtered.length}</Text>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col>
          <Input
            placeholder="Search by name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
          />
        </Col>
        <Col>
          <Input
            placeholder="Search by college"
            value={searchCollege}
            onChange={(e) => setSearchCollege(e.target.value)}
          />
        </Col>
        <Col>
          <Input
            placeholder="Search by year"
            value={searchYear}
            onChange={(e) => setSearchYear(e.target.value)}
          />
        </Col>
        <Col>
          <RangePicker
            format="YYYY-MM-DD"
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
          />
        </Col>
        <Col>
          <Select
            mode="multiple"
            allowClear
            placeholder="Filter by skills"
            style={{ width: 160 }}
            value={selectedSkills}
            onChange={setSelectedSkills}
            options={allSkills.map((skill) => ({
              label: skill,
              value: skill,
            }))}
          />
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={resetFilters}>
          </Button>
        </Col>
      </Row>

      {loading ? (
        <Spin size="large" />
      ) : (
        <Table
          dataSource={filtered}
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
