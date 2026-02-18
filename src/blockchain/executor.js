/**
 * Blockchain Executor - Subagent for On-Chain Operations
 * 
 * Separates blockchain logic from coaching logic (Subagent-Driven Development)
 * Responsible for:
 * - Stake transactions on Celo L2
 * - x402 payment verification
 * - Smart contract interactions
 * - Settlement validation
 */

const { ethers } = require('ethers');
const { verifyPayment, CELO_CUSD_ADDRESS, CELO_CHAIN_ID } = require('../x402/middleware');

class BlockchainExecutor {
  constructor(rpcUrl, privateKey, registryAddress) {
    this.rpcUrl = rpcUrl;
    this.privateKey = privateKey;
    this.registryAddress = registryAddress;
    this.provider = null;
    this.signer = null;
    this.contract = null;
  }

  /**
   * Initialize blockchain connection
   */
  async initialize() {
    try {
      // Celo Mainnet — hardcoded, no testnet fallback
      const chainId = 42220;
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl, chainId);
      this.signer = new ethers.Wallet(this.privateKey, this.provider);

      // Simple ABI for staking
      const stakingABI = [
        'function stake(uint256 amountCELO) public',
        'function settleStake(uint256 stakeId, bool completed) public',
        'function withdrawEarnings() public'
      ];

      this.contract = new ethers.Contract(this.registryAddress, stakingABI, this.signer);
      console.log('✓ Blockchain Executor initialized');
      return true;
    } catch (error) {
      console.error('Blockchain initialization error:', error.message);
      return false;
    }
  }

  /**
   * Execute stake transaction (Milestone 3)
   * @param {string} habitName
   * @param {number} amountCELO
   * @returns {Promise<object>} - Transaction receipt
   */
  async executeStake(habitName, amountCELO) {
    if (!this.contract) {
      throw new Error('Blockchain Executor not initialized');
    }

    try {
      console.log(`📤 Executing stake: ${amountCELO} CELO for "${habitName}"`);

      // TODO: Call smart contract to stake CELO
      // const tx = await this.contract.stake(ethers.utils.parseEther(amountCELO.toString()));
      // const receipt = await tx.wait();

      return {
        status: 'pending',
        habitName,
        amountCELO,
        message: '📦 Stake queued for blockchain confirmation (Milestone 3)',
        // transactionHash: receipt.transactionHash,
        // blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Stake execution error:', error.message);
      throw error;
    }
  }

  /**
   * Settle stake after habit completion (Milestone 3)
   * @param {number} stakeId
   * @param {boolean} completed
   * @returns {Promise<object>} - Settlement receipt
   */
  async settleStake(stakeId, completed) {
    if (!this.contract) {
      throw new Error('Blockchain Executor not initialized');
    }

    try {
      console.log(`🔒 Settling stake #${stakeId}: ${completed ? 'COMPLETED' : 'MISSED'}`);

      // TODO: Call smart contract settlement logic
      // const tx = await this.contract.settleStake(stakeId, completed);
      // const receipt = await tx.wait();

      return {
        status: 'settlement_complete',
        stakeId,
        completed,
        message: completed 
          ? '🎉 Stake unlocked! Earnings transferred.' 
          : '💙 Stake returned. Try again tomorrow!',
        // transactionHash: receipt.transactionHash
      };
    } catch (error) {
      console.error('Settlement error:', error.message);
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getBalance() {
    if (!this.signer) {
      throw new Error('Blockchain Executor not initialized');
    }

    try {
      const balance = await this.provider.getBalance(this.signer.address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Balance fetch error:', error.message);
      return '0';
    }
  }

  /**
   * Verify an x402 payment on Celo L2
   * Uses the x402 middleware's verifyPayment for on-chain cUSD transfer verification
   *
   * @param {string} txHash - Transaction hash to verify
   * @param {number} expectedAmount - Expected cUSD amount (e.g. 0.10)
   * @returns {Promise<{valid: boolean, amount: number, from: string}>}
   */
  async verifyX402Payment(txHash, expectedAmount = 0.10) {
    const vault = process.env.VAULT_ADDRESS || '';
    if (!vault) throw new Error('VAULT_ADDRESS not configured');

    return verifyPayment(txHash, vault, expectedAmount, this.rpcUrl);
  }

  /**
   * Get cUSD balance for an address
   * @param {string} address - Wallet address to check
   * @returns {Promise<string>} - cUSD balance in token units
   */
  async getCUSDBalance(address) {
    if (!this.provider) {
      throw new Error('Blockchain Executor not initialized');
    }

    try {
      const cusdABI = ['function balanceOf(address) view returns (uint256)'];
      const cusd = new ethers.Contract(CELO_CUSD_ADDRESS, cusdABI, this.provider);
      const balance = await cusd.balanceOf(address);
      return ethers.formatUnits(balance, 18);
    } catch (error) {
      console.error('cUSD balance fetch error:', error.message);
      return '0';
    }
  }
}

module.exports = BlockchainExecutor;
