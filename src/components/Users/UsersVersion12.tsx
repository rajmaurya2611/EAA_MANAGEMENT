// src/components/UsersVersion12.tsx

import React, { useEffect, useState } from "react";
import {
  Table,
  Spin,
  message,
  Select,
  DatePicker,
  Button,
  Input,
} from "antd";
import {
  DownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { getDatabase, ref as dbRef, onValue, off, DataSnapshot } from "firebase/database";
import CryptoJS from "crypto-js";
import * as XLSX from "xlsx";
import dayjs, { Dayjs } from "dayjs";

const { Option } = Select;
const { RangePicker } = DatePicker;

const AES_SECRET_KEY = import.meta.env.VITE_AES_SECRET_KEY!; // Must match Android key

const decryptAES = (encryptedText: string) => {
  try {
    const key = CryptoJS.enc.Utf8.parse(AES_SECRET_KEY);
    const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const txt = decrypted.toString(CryptoJS.enc.Utf8);
    return txt || encryptedText;
  } catch {
    console.warn(`Skipping decryption for: ${encryptedText}`);
    return encryptedText;
  }
};

interface UserData {
  key: string;
  name: string;
  year: string;
  email: string;
  college: string;
  branch: string;
  registrationType: string;
  registrationDate: string;
}

const UsersVersion12: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  const [collegeFilter, setCollegeFilter] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [searchText, setSearchText] = useState("");

  // Fetch & decrypt
  useEffect(() => {
    const db = getDatabase();
    const usersRef = dbRef(db, "version12/users");

    const listener = (snap: DataSnapshot) => {
      const val = snap.val();
      if (!val || typeof val !== "object") {
        setUsers([]);
        setFilteredUsers([]);
        setLoading(false);
        return;
      }

      const arr: UserData[] = Object.entries(val).map(([id, data]) => {
        const u = data as Record<string, string>;
        return {
          key: id,
          name: decryptAES(u.name || ""),
          year: decryptAES(u.year || ""),
          email: decryptAES(u.email || ""),
          college: decryptAES(u.college || ""),
          branch: decryptAES(u.branch || ""),
          registrationType: u.RegistrationTime || "",
          registrationDate: u.RegistrationDate || "",
        };
      });

      // sort by date descending
      const sorted = arr.sort((a, b) =>
        dayjs(b.registrationDate).valueOf() - dayjs(a.registrationDate).valueOf()
      );

      setUsers(sorted);
      setFilteredUsers(sorted);
      setLoading(false);
    };

    onValue(usersRef, listener, (err) => {
      console.error(err);
      message.error("Failed to fetch users v12");
      setLoading(false);
    });

    return () => off(usersRef, "value", listener);
  }, []);

  // Re-apply filters whenever inputs change
  useEffect(() => {
    let res = [...users];

    if (collegeFilter) res = res.filter(u => u.college === collegeFilter);
    if (branchFilter)  res = res.filter(u => u.branch === branchFilter);
    if (yearFilter)    res = res.filter(u => u.year === yearFilter);

    if (dateRange[0] && dateRange[1]) {
      const [start, end] = dateRange;
      res = res.filter(u => {
        const d = dayjs(u.registrationDate);
        return d.isAfter(start.startOf("day")) && d.isBefore(end.endOf("day"));
      });
    }

    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      res = res.filter(
        u =>
          u.name.toLowerCase().includes(s) ||
          u.email.toLowerCase().includes(s)
      );
    }

    setFilteredUsers(res);
  }, [collegeFilter, branchFilter, yearFilter, dateRange, searchText, users]);

  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(filteredUsers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "UsersV12");
    XLSX.writeFile(wb, "Users_Version12.csv");
  };

  const resetFilters = () => {
    setCollegeFilter(null);
    setBranchFilter(null);
    setYearFilter(null);
    setDateRange([null, null]);
    setSearchText("");
  };

  const unique = (arr: string[]) => Array.from(new Set(arr)).sort();

  const columns = [
    { title: "Name",               dataIndex: "name",              key: "name" },
    { title: "Year",               dataIndex: "year",              key: "year" },
    { title: "Email",              dataIndex: "email",             key: "email" },
    { title: "College",            dataIndex: "college",           key: "college" },
    { title: "Branch",             dataIndex: "branch",            key: "branch" },
    { title: "Registration Type",  dataIndex: "registrationType",  key: "registrationType" },
    { title: "Registration Date",  dataIndex: "registrationDate",  key: "registrationDate" },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 className="text-xl font-semibold">Users Version 12</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 500 }}>Total: {filteredUsers.length}</span>
          <Button icon={<DownloadOutlined />} onClick={exportToCSV}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <Input.Search
          placeholder="Search Name or Email"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          allowClear
          style={{ width: 220 }}
        />

        <Select
          placeholder="College"
          value={collegeFilter || undefined}
          allowClear
          onChange={val => setCollegeFilter(val)}
          style={{ width: 160 }}
        >
          {unique(users.map(u => u.college)).map(col => (
            <Option key={col} value={col}>{col}</Option>
          ))}
        </Select>

        <Select
          placeholder="Branch"
          value={branchFilter || undefined}
          allowClear
          onChange={val => setBranchFilter(val)}
          style={{ width: 160 }}
        >
          {unique(users.map(u => u.branch)).map(br => (
            <Option key={br} value={br}>{br}</Option>
          ))}
        </Select>

        <Select
          placeholder="Year"
          value={yearFilter || undefined}
          allowClear
          onChange={val => setYearFilter(val)}
          style={{ width: 120 }}
        >
          {unique(users.map(u => u.year)).map(yr => (
            <Option key={yr} value={yr}>{yr}</Option>
          ))}
        </Select>

        <RangePicker
          value={dateRange}
          onChange={rng => setDateRange(rng || [null, null])}
        />

        <Button onClick={resetFilters} icon={<ReloadOutlined />} />
      </div>

      {/* Table */}
      {loading ? (
        <Spin size="large" style={{ display: "block", margin: "100px auto" }} />
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

export default UsersVersion12;

