import React, { useEffect, useState } from 'react';
import {
  Table,
  Spin,
  message,
  Select,
  DatePicker,
  Button,
  Input,
} from 'antd';
import {
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { db } from '../../firebaseConfig';
import { ref as dbRef, onValue } from 'firebase/database';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

const UsersOld: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [collegeFilter, setCollegeFilter] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const usersRef = dbRef(db, 'Registered_students');

    const unsubscribe = onValue(
      usersRef,
      (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          setUsers([]);
          setFilteredUsers([]);
          setLoading(false);
          return;
        }

        const parsedUsers = Object.entries(data).map(([id, user]: [string, any]) => ({
          key: id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          college: user.college_name,
          branch: user.branch,
          year: user.year,
          date: user.date,
        }));

        const sorted = parsedUsers.sort((a, b) =>
          dayjs(b.date).valueOf() - dayjs(a.date).valueOf()
        );

        setUsers(sorted);
        setFilteredUsers(sorted);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching users:', err);
        message.error('Failed to fetch old user data');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let result = [...users];

    if (collegeFilter) result = result.filter(u => u.college === collegeFilter);
    if (branchFilter) result = result.filter(u => u.branch === branchFilter);
    if (yearFilter) result = result.filter(u => u.year === yearFilter);

    if (dateRange[0] && dateRange[1]) {
      const [start, end] = dateRange;
      result = result.filter((u) => {
        const userDate = dayjs(u.date);
        return userDate.isAfter(start.startOf('day')) && userDate.isBefore(end.endOf('day'));
      });
    }

    if (searchText.trim()) {
      const lowerSearch = searchText.toLowerCase();
      result = result.filter(
        (u) =>
          u.name?.toLowerCase().includes(lowerSearch) ||
          u.email?.toLowerCase().includes(lowerSearch)
      );
    }

    setFilteredUsers(result);
  }, [collegeFilter, branchFilter, yearFilter, dateRange, searchText, users]);

  const exportToCSV = () => {
    const sheet = XLSX.utils.json_to_sheet(filteredUsers);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'OldUsers');
    XLSX.writeFile(workbook, 'Old_Users_List.csv');
  };

  const resetFilters = () => {
    setCollegeFilter(null);
    setBranchFilter(null);
    setYearFilter(null);
    setDateRange([null, null]);
    setSearchText('');
  };

  const unique = (arr: string[]) => Array.from(new Set(arr)).sort();

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'College', dataIndex: 'college', key: 'college' },
    { title: 'Branch', dataIndex: 'branch', key: 'branch' },
    { title: 'Year', dataIndex: 'year', key: 'year' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="text-xl font-semibold">Old Registered Users</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 500 }}>Total: {filteredUsers.length}</span>
          <Button icon={<DownloadOutlined />} onClick={exportToCSV}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters in one row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Input.Search
          placeholder="Search Name or Email"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{ width: 220 }}
        />

        <Select
          placeholder="College"
          value={collegeFilter || undefined}
          allowClear
          onChange={(val) => setCollegeFilter(val)}
          style={{ width: 160 }}
        >
          {unique(users.map(u => u.college)).map(college => (
            <Option key={college} value={college}>{college}</Option>
          ))}
        </Select>

        <Select
          placeholder="Branch"
          value={branchFilter || undefined}
          allowClear
          onChange={(val) => setBranchFilter(val)}
          style={{ width: 160 }}
        >
          {unique(users.map(u => u.branch)).map(branch => (
            <Option key={branch} value={branch}>{branch}</Option>
          ))}
        </Select>

        <Select
          placeholder="Year"
          value={yearFilter || undefined}
          allowClear
          onChange={(val) => setYearFilter(val)}
          style={{ width: 160 }}
        >
          {unique(users.map(u => u.year)).map(year => (
            <Option key={year} value={year}>{year}</Option>
          ))}
        </Select>

        <RangePicker
          value={dateRange}
          onChange={(range) => setDateRange(range || [null, null])}
        />

        <Button onClick={resetFilters} icon={<ReloadOutlined />}>
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
      ) : (
        <Table
          columns={columns}
          dataSource={filteredUsers}
          pagination={{ pageSize: 10 }}
          scroll={{ x: true }}
        />
      )}
    </div>
  );
};

export default UsersOld;
