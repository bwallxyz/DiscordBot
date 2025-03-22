import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  CircularProgress,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import axios from 'axios';

const Rooms = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalRooms, setTotalRooms] = useState(0);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/rooms', {
        params: {
          page,
          limit: rowsPerPage,
          search: searchTerm
        },
        withCredentials: true
      });
      
      setRooms(res.data.rooms);
      setTotalRooms(res.data.total);
      setError(null);
    } catch (err) {
      console.error('Error fetching rooms:', err);
      setError('Failed to load rooms. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [page, rowsPerPage, searchTerm]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  const handleRefresh = () => {
    fetchRooms();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  };

  const handleDeleteRoom = async (roomId) => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      try {
        await axios.delete(`/api/rooms/${roomId}`, { withCredentials: true });
        fetchRooms();
      } catch (err) {
        console.error('Error deleting room:', err);
        alert('Failed to delete room. Please try again later.');
      }
    }
  };

  const handleToggleLock = async (roomId, currentStatus) => {
    try {
      await axios.patch(`/api/rooms/${roomId}`, {
        isLocked: !currentStatus
      }, { withCredentials: true });
      fetchRooms();
    } catch (err) {
      console.error('Error updating room lock status:', err);
      alert('Failed to update room. Please try again later.');
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Voice Rooms
      </Typography>
      
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search rooms..."
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error" sx={{ p: 2 }}>
            {error}
          </Typography>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Room Name</TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Last Activity</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rooms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No rooms found
                      </TableCell>
                    </TableRow>
                  ) : (
                    rooms.map((room) => (
                      <TableRow key={room._id}>
                        <TableCell>{room.name}</TableCell>
                        <TableCell>{room.ownerUsername || room.ownerId}</TableCell>
                        <TableCell>
                          <Chip 
                            size="small"
                            label={room.isLocked ? "Locked" : "Open"} 
                            color={room.isLocked ? "error" : "success"}
                          />
                        </TableCell>
                        <TableCell>{formatDate(room.createdAt)}</TableCell>
                        <TableCell>{formatDate(room.lastActivity)}</TableCell>
                        <TableCell align="center">
                          <Tooltip title={room.isLocked ? "Unlock Room" : "Lock Room"}>
                            <IconButton 
                              size="small"
                              onClick={() => handleToggleLock(room._id, room.isLocked)}
                            >
                              {room.isLocked ? <LockOpenIcon /> : <LockIcon />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Room">
                            <IconButton 
                              size="small"
                              color="error"
                              onClick={() => handleDeleteRoom(room._id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={totalRooms}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </>
        )}
      </Paper>
    </Box>
  );
};

export default Rooms;