import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import axios from 'axios';

const Levels = () => {
  const [settings, setSettings] = useState(null);
  const [levelRoles, setLevelRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [editedSettings, setEditedSettings] = useState({});
  const [openRoleDialog, setOpenRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState({ level: '', roleId: '', roleName: '' });
  const [serverRoles, setServerRoles] = useState([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch level settings
  const fetchLevelSettings = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/levels/settings', { withCredentials: true });
      setSettings(res.data.settings);
      setLevelRoles(res.data.levelRoles);
      setServerRoles(res.data.serverRoles);
      setError(null);
    } catch (err) {
      console.error('Error fetching level settings:', err);
      setError('Failed to load level settings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLevelSettings();
  }, []);

  // Start editing settings
  const handleEditSettings = () => {
    setEditedSettings({
      voiceXpPerMinute: settings.xpSettings.voiceXpPerMinute,
      messageXpPerMessage: settings.xpSettings.messageXpPerMessage,
      messageXpCooldown: settings.xpSettings.messageXpCooldown,
      notificationChannelId: settings.notifications.channelId || '',
      dmNotifications: settings.notifications.dmUser,
      channelNotifications: settings.notifications.announceInChannel
    });
    setEditingSettings(true);
  };

  // Save edited settings
  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      await axios.put('/api/levels/settings', editedSettings, { withCredentials: true });
      fetchLevelSettings();
      setEditingSettings(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingSettings(false);
  };

  // Handle settings change
  const handleSettingChange = (setting, value) => {
    setEditedSettings({
      ...editedSettings,
      [setting]: value
    });
  };

  // Open add role dialog
  const handleAddRole = () => {
    setNewRole({ level: '', roleId: '', roleName: '' });
    setOpenRoleDialog(true);
  };

  // Close role dialog
  const handleCloseRoleDialog = () => {
    setOpenRoleDialog(false);
  };

  // Save new role
  const handleSaveRole = async () => {
    if (!newRole.level || !newRole.roleId) {
      setError('Level and role are required');
      return;
    }

    try {
      setLoading(true);
      await axios.post('/api/levels/roles', {
        level: newRole.level,
        roleId: newRole.roleId
      }, { withCredentials: true });
      fetchLevelSettings();
      setOpenRoleDialog(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error adding level role:', err);
      setError('Failed to add level role. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Delete level role
  const handleDeleteRole = async (level) => {
    if (window.confirm(`Are you sure you want to remove the role for level ${level}?`)) {
      try {
        setLoading(true);
        await axios.delete(`/api/levels/roles/${level}`, { withCredentials: true });
        fetchLevelSettings();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (err) {
        console.error('Error deleting level role:', err);
        setError('Failed to delete level role. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading && !settings) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Level System Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Changes saved successfully!
        </Alert>
      )}

      {settings && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">XP Settings</Typography>
                {!editingSettings ? (
                  <Button 
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={handleEditSettings}
                  >
                    Edit
                  </Button>
                ) : (
                  <Box>
                    <IconButton color="primary" onClick={handleSaveSettings}>
                      <SaveIcon />
                    </IconButton>
                    <IconButton color="error" onClick={handleCancelEdit}>
                      <CancelIcon />
                    </IconButton>
                  </Box>
                )}
              </Box>
              <Divider sx={{ mb: 3 }} />

              {editingSettings ? (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Voice XP per Minute"
                      type="number"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.voiceXpPerMinute}
                      onChange={(e) => handleSettingChange('voiceXpPerMinute', parseFloat(e.target.value))}
                      InputProps={{ inputProps: { min: 0.1, step: 0.1 } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Message XP per Message"
                      type="number"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.messageXpPerMessage}
                      onChange={(e) => handleSettingChange('messageXpPerMessage', parseFloat(e.target.value))}
                      InputProps={{ inputProps: { min: 0.1, step: 0.1 } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Message Cooldown (seconds)"
                      type="number"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.messageXpCooldown}
                      onChange={(e) => handleSettingChange('messageXpCooldown', parseInt(e.target.value))}
                      InputProps={{ inputProps: { min: 10, step: 1 } }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      select
                      label="Notification Channel"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.notificationChannelId}
                      onChange={(e) => handleSettingChange('notificationChannelId', e.target.value)}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {(serverRoles.channels || []).map((channel) => (
                        <MenuItem key={channel.id} value={channel.id}>
                          {channel.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      label="DM Notifications"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.dmNotifications ? 'true' : 'false'}
                      onChange={(e) => handleSettingChange('dmNotifications', e.target.value === 'true')}
                    >
                      <MenuItem value="true">Enabled</MenuItem>
                      <MenuItem value="false">Disabled</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      select
                      label="Channel Announcements"
                      fullWidth
                      variant="outlined"
                      value={editedSettings.channelNotifications ? 'true' : 'false'}
                      onChange={(e) => handleSettingChange('channelNotifications', e.target.value === 'true')}
                    >
                      <MenuItem value="true">Enabled</MenuItem>
                      <MenuItem value="false">Disabled</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              ) : (
                <Box>
                  <Typography variant="body1" gutterBottom>
                    <strong>Voice XP:</strong> {settings.xpSettings.voiceXpPerMinute} XP per minute
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    <strong>Message XP:</strong> {settings.xpSettings.messageXpPerMessage} XP per message
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    <strong>Message Cooldown:</strong> {settings.xpSettings.messageXpCooldown} seconds
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    <strong>Base XP for Level 1:</strong> {settings.xpSettings.baseMultiplier} XP
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    <strong>XP Scaling Factor:</strong> {settings.xpSettings.scalingMultiplier}x
                  </Typography>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="subtitle1" gutterBottom>
                    Notification Settings
                  </Typography>
                  
                  <Typography variant="body1" gutterBottom>
                    <strong>Notifications:</strong> {settings.notifications.enabled ? 'Enabled' : 'Disabled'}
                  </Typography>
                  
                  {settings.notifications.channelId && (
                    <Typography variant="body1" gutterBottom>
                      <strong>Notification Channel:</strong> {settings.notificationChannelName || settings.notifications.channelId}
                    </Typography>
                  )}
                  
                  <Typography variant="body1" gutterBottom>
                    <strong>DM Notifications:</strong> {settings.notifications.dmUser ? 'Enabled' : 'Disabled'}
                  </Typography>
                  
                  <Typography variant="body1" gutterBottom>
                    <strong>Channel Announcements:</strong> {settings.notifications.announceInChannel ? 'Enabled' : 'Disabled'}
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Level Roles</Typography>
                <Button 
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddRole}
                >
                  Add Role
                </Button>
              </Box>
              <Divider sx={{ mb: 3 }} />
              
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Level</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {levelRoles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          No level roles configured
                        </TableCell>
                      </TableRow>
                    ) : (
                      levelRoles.map((role) => (
                        <TableRow key={role.level}>
                          <TableCell>{role.level}</TableCell>
                          <TableCell>{role.roleName}</TableCell>
                          <TableCell align="center">
                            <Tooltip title="Delete Role">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteRole(role.level)}
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
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Add Role Dialog */}
      <Dialog open={openRoleDialog} onClose={handleCloseRoleDialog}>
        <DialogTitle>Add Level Role</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Level"
                type="number"
                fullWidth
                value={newRole.level}
                onChange={(e) => setNewRole({ ...newRole, level: e.target.value })}
                InputProps={{ inputProps: { min: 1 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                select
                label="Role"
                fullWidth
                value={newRole.roleId}
                onChange={(e) => {
                  const selectedRole = serverRoles.roles.find(r => r.id === e.target.value);
                  setNewRole({ 
                    ...newRole, 
                    roleId: e.target.value,
                    roleName: selectedRole ? selectedRole.name : ''
                  });
                }}
              >
                {(serverRoles.roles || []).map((role) => (
                  <MenuItem key={role.id} value={role.id}>
                    {role.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRoleDialog}>Cancel</Button>
          <Button onClick={handleSaveRole} variant="contained" color="primary">
            Add Role
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Levels;