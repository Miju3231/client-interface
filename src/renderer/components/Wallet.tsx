import {
  Box,
  Button,
  Heading,
  Layer,
  Text,
  TextInput,
  DropButton,
} from 'grommet';
import { useContext, useEffect, useState } from 'react';
import { WalletContext } from 'renderer/context/walletContext';
import truncateEthAddress from 'truncate-eth-address';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useContractWrite,
  useWaitForTransaction,
} from 'wagmi';
import jose from 'node-jose';
import { getPublicCompressed } from '@toruslabs/eccrypto';
import { FLOCK_ABI, FLOCK_ADDRESS } from 'renderer/contracts/flock';
import { ToastContainer, toast } from 'react-toastify';
import { web3AuthInstance } from '../Web3AuthInstance';
import 'react-toastify/dist/ReactToastify.css';

function Wallet() {
  const { address } = useAccount();
  const [showWalletSettings, setShowWalletSettings] = useState(false);
  const [transferAmount, setTransferAmount] = useState(0);
  const [transferAddress, setTransferAddress] = useState('');
  const [isTransferLoading, setIsTransferLoading] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [showWalletImport, setShowWalletImport] = useState(false);
  const { connectAsync, connectors, pendingConnector } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { nativeTokenBalance, flockTokenBalance } = useContext(WalletContext);
  const [privateKey, setPrivateKey] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [showEmailImport, setShowEmailImport] = useState(false);

  const handleConnect = async () => {
    setIsWalletOpen(false);
    await connectAsync({
      connector: connectors[0],
    });
  };

  const handleImport = async () => {
    // @ts-ignore
    setIsWalletOpen(false);
    try {
      await connectors[1].setPrivateKey(`0x${privateKey}`);
      await connectAsync({
        connector: connectors[1],
      });
    } catch (error) {
      toast.error('Invalid private key');
    }
  };

  const loadEmail = async () => {
    try {
      const res = await fetch(
        `https://us-central1-flock-demo-design.cloudfunctions.net/getEmailFromDB?wallet=${address}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const email = await res.json();
      setUserEmail(email);
      setShowWalletImport(false);
    } catch (error) {
      setShowWalletImport(false);
      setShowEmailImport(true);
    }
  };

  const importEmail = async () => {
    try {
      const publicKey = getPublicCompressed(
        Buffer.from(privateKey.padStart(64, '0'), 'hex')
      ).toString('hex');

      const payload = {
        publicKey,
      };

      const keyStore = jose.JWK.createKeyStore();

      // Create a key object from the private key string
      const key = await keyStore.add({
        kty: 'oct',
        k: privateKey,
      });

      // Sign the JWT using the key
      const jwt = await jose.JWS.createSign({ format: 'compact' }, key)
        .update(JSON.stringify(payload))
        .final();

      const res = await fetch(
        'https://us-central1-flock-demo-design.cloudfunctions.net/postEmailToDB',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            pubKey: publicKey,
            email: userEmail,
            wallet: address,
          }),
        }
      );
      setShowEmailImport(true);
    } catch (error) {
      console.error('Error importing email:', error);
    }
  };

  const handleDisconnect = async () => {
    wagmiDisconnect();
  };

  interface UserInfo {
    email: string;
    address: string;
    name?: string;
    profileImage?: string;
    aggregateVerifier?: string;
    verifier?: string;
    verifierId?: string;
    typeOfLogin?: string;
    dappShare?: string;
    idToken?: string; //jwt
    oAuthIdToken?: string;
    oAuthAccessToken?: string;
  }

  const loadUserInfo = async () => {
    try {
      if (pendingConnector?.id === 'web3auth') {
        const privateKey = (await web3AuthInstance.provider?.request({
          method: 'eth_private_key',
        })) as string;

        const publicKey = getPublicCompressed(
          Buffer.from(privateKey.padStart(64, '0'), 'hex')
        ).toString('hex');
        const user = await web3AuthInstance.getUserInfo();

        const res = await fetch(
          'https://us-central1-flock-demo-design.cloudfunctions.net/postEmailToDB',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${user.idToken}`,
            },
            body: JSON.stringify({
              pubKey: publicKey,
              email: user.email,
              wallet: address,
            }),
          }
        );
      }
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  const { data: dataTransfer, writeAsync: writeAsyncApprove } =
    useContractWrite({
      address: FLOCK_ADDRESS as `0x${string}`,
      abi: FLOCK_ABI,
      functionName: 'transfer',
    });

  const { isSuccess: isSuccessTransfer } = useWaitForTransaction({
    hash: dataTransfer?.hash,
  });

  const handleTransfer = async () => {
    setIsTransferLoading(true);
    await writeAsyncApprove({
      args: [transferAddress, transferAmount * 10 ** 18],
    });
  };

  useEffect(() => {
    if (isSuccessTransfer) {
      toast.success(`Transferred ${transferAmount} FLC successfully`);
      setIsTransferLoading(false);
    }
  }, [isSuccessTransfer]);

  useEffect(() => {
    if (address) {
      loadEmail();
      loadUserInfo();
    }
  }, [address]);

  if (showWalletSettings) {
    return (
      <Layer onEsc={() => setShowWalletSettings(false)} full>
        <Box
          align="center"
          justify="center"
          height="100vh"
          pad="large"
          gap="medium"
        >
          <Heading level="3">Wallet Settings</Heading>
          <Box align="start" gap="xsmall">
            <Text>
              <b>Wallet Address:</b> {address}
            </Text>
            <Text>
              <b>FLock(FLC) Balance: </b>
              {flockTokenBalance ? flockTokenBalance.formatted : 0} $F
            </Text>
            <Text>
              <b>MATIC Balance: </b>
              {nativeTokenBalance ? nativeTokenBalance.formatted : 0} $MATIC
            </Text>
            <Box gap="small" margin={{ top: 'small' }}>
              <Text alignSelf="center" weight="bold">
                Transfer FLC tokens
              </Text>
              <Box direction="row" gap="small">
                <TextInput
                  width="small"
                  type="number"
                  placeholder="Amount"
                  value={transferAmount}
                  onChange={(event: any) =>
                    setTransferAmount(event.target.value)
                  }
                />
                <TextInput
                  width="medium"
                  type="text"
                  placeholder="Address"
                  value={transferAddress}
                  onChange={(event: any) =>
                    setTransferAddress(event.target.value)
                  }
                />
              </Box>

              <Button
                alignSelf="center"
                label={isTransferLoading ? 'Transferring...' : 'Transfer'}
                onClick={handleTransfer}
                disabled={isTransferLoading}
              />
            </Box>
          </Box>
          <Box direction="row" alignSelf="end" gap="small">
            <Button
              secondary
              label="Go Back"
              onClick={() => setShowWalletSettings(false)}
            />
            <Button
              primary
              label="Disconnect"
              onClick={() => {
                handleDisconnect();
                setShowWalletSettings(false);
              }}
            />
          </Box>
        </Box>
        <ToastContainer
          position="bottom-left"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </Layer>
    );
  }

  if (showWalletImport) {
    return (
      <Layer onEsc={() => setShowWalletImport(false)} full>
        <Box
          align="center"
          justify="center"
          height="100vh"
          pad="large"
          gap="medium"
        >
          <Heading level="3">Import your wallet</Heading>
          <TextInput
            value={privateKey}
            onChange={(event) => setPrivateKey(event.target.value)}
          />
          <Box direction="row" alignSelf="center" gap="small">
            <Button
              primary
              label="Cancel"
              pad="xsmall"
              onClick={() => setShowWalletImport(false)}
            />
            <Button
              primary
              label="Import Wallet"
              pad="xsmall"
              disabled={!privateKey}
              onClick={handleImport}
            />
          </Box>
        </Box>
        <ToastContainer
          position="bottom-left"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </Layer>
    );
  }

  if (showEmailImport) {
    return (
      <Layer onEsc={() => setShowWalletImport(false)} full>
        <Box
          align="center"
          justify="center"
          height="100vh"
          pad="large"
          gap="medium"
        >
          <Heading level="3">Enter your email</Heading>
          <Text>This email will be used for claiming OAT</Text>
          <TextInput
            value={userEmail}
            onChange={(event) => setUserEmail(event.target.value)}
          />
          <Box direction="row" alignSelf="center" gap="small">
            <Button
              primary
              label="Enter"
              pad="xsmall"
              disabled={!privateKey}
              onClick={handleImport}
            />
          </Box>
        </Box>
        <ToastContainer
          position="bottom-left"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </Layer>
    );
  }

  return (
    <DropButton
      primary
      open={isWalletOpen}
      dropAlign={{ top: 'bottom' }}
      dropContent={
        <Box direction="row-responsive" gap="xsmall" justify="between">
          <Box basis="1/2" pad="small">
            <Button
              primary
              label="Social Login"
              pad="xsmall"
              onClick={handleConnect}
            />
          </Box>
          <Box basis="1/2" pad="small">
            <Button
              primary
              label="Import Wallet"
              pad="xsmall"
              onClick={() => setShowWalletImport(true)}
            />
          </Box>
        </Box>
      }
      label={
        !address
          ? 'Connect Wallet'
          : `(${
              flockTokenBalance ? flockTokenBalance.formatted : 0
            } $F) ${truncateEthAddress(address)}`
      }
      onClick={
        address
          ? () => {
              setShowWalletSettings(true);
            }
          : () => {
              setIsWalletOpen(true);
            }
      }
      dropProps={{
        background: { color: 'white' },
        onClickOutside: () => setIsWalletOpen(false),
        margin: { top: 'xsmall' },
        round: 'small',
      }}
    />
  );
}

export default Wallet;
