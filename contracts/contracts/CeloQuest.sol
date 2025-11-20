// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CeloQuest is Ownable, ReentrancyGuard {

    // Celo Mainnet cUSD Address (18 Decimals)
    address public constant CUSD_TOKEN = 0x765DE816845861e75A25fCA122bb6898B8B1282a;

    struct Submission {
        uint256 questId;
        address player;
        bytes32[] answers;
        bool claimed;
    }

    struct Quest {
        uint256 id;
        address creator;
        uint256 startTime;
        uint256 endTime;
        uint256 entryFee;
        uint256 prizePool;
        address[] players;
        bytes32[] correctAnswers;
        bool resultsPublished;
        bool isCommunity;
    }

    uint256 public currentQuestId;
    
    // MAINNET FIX: 0.1 cUSD with 18 decimals (1 followed by 17 zeros)
    uint256 public defaultEntryFee = 100000000000000000; 

    mapping(uint256 => Quest) public quests;
    mapping(uint256 => mapping(address => Submission)) public submissions;

    event QuestCreated(uint256 indexed questId, address creator, bool isCommunity);
    event QuestJoined(uint256 indexed questId, address indexed player);
    event QuestResults(uint256 indexed questId, uint256 prizePool, uint256 winners);

    constructor() Ownable(msg.sender) {
        currentQuestId = 0;
        _startDailyQuest();
    }

    function startNewDailyQuest(bytes32[] memory _correctAnswers) external onlyOwner {
        _startDailyQuestInternal(_correctAnswers);
    }

    function _startDailyQuest() private {
        bytes32[] memory placeholderAnswers = new bytes32[](3);
        placeholderAnswers[0] = keccak256(abi.encodePacked("CELO"));
        placeholderAnswers[1] = keccak256(abi.encodePacked("True"));
        placeholderAnswers[2] = keccak256(abi.encodePacked("Celo"));
        _startDailyQuestInternal(placeholderAnswers);
    }

    function _startDailyQuestInternal(bytes32[] memory _answers) private {
        currentQuestId++;
        quests[currentQuestId] = Quest({
            id: currentQuestId,
            creator: owner(),
            startTime: block.timestamp,
            endTime: block.timestamp + 24 hours,
            entryFee: defaultEntryFee,
            prizePool: 0,
            players: new address[](0),
            correctAnswers: _answers,
            resultsPublished: false,
            isCommunity: false
        });
        emit QuestCreated(currentQuestId, owner(), false);
    }

    // --- COMMUNITY QUEST LOGIC ---
    function createCommunityQuest(
        uint256 _entryFee, 
        uint256 _durationInHours, 
        bytes32[] memory _correctAnswers
    ) external returns (uint256) {
        require(_durationInHours > 0 && _durationInHours <= 168, "Duration 1-168 hours");
        
        currentQuestId++;
        
        quests[currentQuestId] = Quest({
            id: currentQuestId,
            creator: msg.sender,
            startTime: block.timestamp,
            endTime: block.timestamp + (_durationInHours * 1 hours),
            entryFee: _entryFee,
            prizePool: 0,
            players: new address[](0),
            correctAnswers: _correctAnswers,
            resultsPublished: false,
            isCommunity: true
        });

        emit QuestCreated(currentQuestId, msg.sender, true);
        return currentQuestId;
    }

    function joinQuest(bytes32[] memory _answers) external {
        joinQuestById(currentQuestId, _answers);
    }

    function joinQuestById(uint256 _questId, bytes32[] memory _answers) public nonReentrant {
        Quest storage q = quests[_questId];
        
        require(q.id != 0, "Quest does not exist");
        require(block.timestamp < q.endTime, "Quest has ended");
        require(_answers.length == q.correctAnswers.length, "Wrong number of answers");
        require(submissions[_questId][msg.sender].player == address(0), "Already joined");

        if (q.entryFee > 0) {
            bool sent = IERC20(CUSD_TOKEN).transferFrom(msg.sender, address(this), q.entryFee);
            require(sent, "cUSD transfer failed");
            q.prizePool += q.entryFee;
        }

        q.players.push(msg.sender);
        submissions[_questId][msg.sender] = Submission({
            questId: _questId,
            player: msg.sender,
            answers: _answers,
            claimed: false
        });

        emit QuestJoined(_questId, msg.sender);
    }

    function distributeRewards(uint256 _questId) external nonReentrant {
        Quest storage q = quests[_questId];
        require(msg.sender == q.creator || msg.sender == owner(), "Not authorized");
        require(block.timestamp > q.endTime, "Quest not over");
        require(!q.resultsPublished, "Rewards already distributed");
        
        uint256 winnerCount = 0;
        address[] memory winners = new address[](q.players.length);

        for (uint i = 0; i < q.players.length; i++) {
            address player = q.players[i];
            Submission storage sub = submissions[_questId][player];
            if (_checkAnswers(sub.answers, q.correctAnswers)) {
                winners[winnerCount] = player;
                winnerCount++;
            }
        }

        if (winnerCount > 0 && q.prizePool > 0) {
            uint256 share = q.prizePool / winnerCount;
            for (uint i = 0; i < winnerCount; i++) {
                submissions[_questId][winners[i]].claimed = true;
                bool sent = IERC20(CUSD_TOKEN).transfer(winners[i], share);
                require(sent, "Reward transfer failed");
            }
        }
        
        q.resultsPublished = true;
        emit QuestResults(_questId, q.prizePool, winnerCount);
    }
    
    function _checkAnswers(bytes32[] memory a, bytes32[] memory b) private pure returns (bool) {
        if (a.length != b.length) return false;
        for (uint i = 0; i < a.length; i++) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }

    function hasJoinedQuest(uint256 _questId, address _player) external view returns (bool) {
        return submissions[_questId][_player].player != address(0);
    }

    function hasJoinedCurrentQuest(address _player) external view returns (bool) {
        return submissions[currentQuestId][_player].player != address(0);
    }
    
    function getCurrentQuestId() external view returns (uint256) {
        return currentQuestId;
    }

    function withdraw() external onlyOwner {
        uint256 balance = IERC20(CUSD_TOKEN).balanceOf(address(this));
        IERC20(CUSD_TOKEN).transfer(msg.sender, balance);
    }
}