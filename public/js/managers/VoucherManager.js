// managers/VoucherManager.js

import Logger from '../utils/Logger.js';
import NetworkManager from '../network/NetworkManager.js';
import ConfigManager from '../config/ConfigManager.js';

class VoucherManager {
  static instance = null;

  constructor() {
    if (VoucherManager.instance) {
      return VoucherManager.instance;
    }
    
    this.logger = Logger.getInstance();
    this.networkManager = NetworkManager.getInstance();
    this.configManager = ConfigManager.getInstance();
    
    VoucherManager.instance = this;
  }

  static getInstance() {
    if (!VoucherManager.instance) {
      VoucherManager.instance = new VoucherManager();
    }
    return VoucherManager.instance;
  }

  async createVoucher({ duration, count, ski_center_ID }) {
    this.logger.debug('Creating voucher', { duration, count, ski_center_ID });
    
    try {
      const endpoint = this.configManager.getEndpoint('voucher.create');
      const response = await this.networkManager.post(endpoint, {
        duration,
        count,
        ski_center_ID
      });
      
      this.logger.debug('Voucher created successfully', response);
      return response;
    } catch (error) {
      this.logger.error('Error creating voucher:', error);
      throw error;
    }
  }
}

export default VoucherManager;

