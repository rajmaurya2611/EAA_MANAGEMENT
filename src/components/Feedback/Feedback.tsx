import React, { useEffect, useState } from 'react';
import {
  Table,
  Typography,
  Spin,
  message,
  Input,
  DatePicker,
  Row,
  Col,
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

// Use your same AES key
const AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY;

interface FeedbackRecord {
  id: string;
  userId: string;
  feedback: string;
  date: string;
  time: string;
  rawDateTime: string;
}

const UserFeedbacks: React.FC = () => {
  const [allFeedbacks, setAllFeedbacks] = useState<FeedbackRecord[]>([]);
  const [filtered, setFiltered] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchUser, setSearchUser] = useState('');
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const decryptAES = (cipherText: string): string => {
    try {
      const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
      const dec = CryptoJS.AES.decrypt(cipherText.trim(), key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      });
      return dec.toString(CryptoJS.enc.Utf8);
    } catch {
      return cipherText;
    }
  };

  useEffect(() => {
    const fbRef = dbRef(db, 'version12/feedbacks');
    const unsub = onValue(
      fbRef,
      (snapshot) => {
        const data = snapshot.val() || {};
        const parsed: FeedbackRecord[] = Object.entries(data)
          .map(([id, entry]: [string, any]) => {
            const full = decryptAES(entry.timestamp);
            const [date, time] = full.split(' ');
            return {
              id,
              userId: decryptAES(entry.userId),
              feedback: decryptAES(entry.feedback),
              date,
              time,
              rawDateTime: full,
            };
          })
          .sort((a, b) => dayjs(b.rawDateTime).unix() - dayjs(a.rawDateTime).unix());

        setAllFeedbacks(parsed);
        setFiltered(parsed);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        message.error('Failed to load feedbacks');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    let list = allFeedbacks.filter(
      (fb) =>
        fb.userId.toLowerCase().includes(searchUser.toLowerCase()) &&
        fb.feedback.toLowerCase().includes(searchText.toLowerCase())
    );

    if (dateRange) {
      const [start, end] = dateRange;
      list = list.filter((fb) =>
        dayjs(fb.date).isBetween(start, end, 'day', '[]')
      );
    }

    setFiltered(list);
  }, [searchUser, searchText, dateRange, allFeedbacks]);

  const resetFilters = () => {
    setSearchUser('');
    setSearchText('');
    setDateRange(null);
  };

  const columns = [
    { title: 'User ID', dataIndex: 'userId', key: 'userId' },
    {
      title: 'Feedback',
      dataIndex: 'feedback',
      key: 'feedback',
      render: (text: string) => (
        <div style={{ maxWidth: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text}
        </div>
      ),
    },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Time', dataIndex: 'time', key: 'time' },
  ];

  return (
    <div style={{ margin: 24, background: '#fff', padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Title level={3}>User Feedbacks</Title></Col>
        <Col><Text strong>Total: {filtered.length}</Text></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col>
          <Input
            placeholder="Search by User ID"
            value={searchUser}
            onChange={e => setSearchUser(e.target.value)}
          />
        </Col>
        <Col>
          <Input
            placeholder="Search by Feedback"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </Col>
        <Col>
          <RangePicker
            format="YYYY-MM-DD"
            value={dateRange}
            onChange={dates => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
          />
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={resetFilters} />
        </Col>
      </Row>

      {loading ? (
        <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
      ) : (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 8 }}
          bordered
        />
      )}
    </div>
  );
};

export default UserFeedbacks;
