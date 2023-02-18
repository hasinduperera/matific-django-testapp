import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { IpAddresses } from 'aws-cdk-lib/aws-ec2';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // Create VPC
    const vpc = new ec2.Vpc(this, 'TestAppVPC', {
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public01',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Public02',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private01',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Private02',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Create Internet Gateway
    const igw = new ec2.CfnInternetGateway(this, 'TestAppInternetGateway');

    // Attach Internet Gateway to VPC
    const vpcAttachment = new ec2.CfnVPCGatewayAttachment(this, 'TestAppVPCGatewayAttachment', {
      vpcId: vpc.vpcId,
      internetGatewayId: igw.ref,
    });    
    
    // Create NAT Gateway
    const ngw = new ec2.CfnNatGateway(this, 'TestAppNATGateway', {
      subnetId: vpc.publicSubnets[0].subnetId,
      allocationId: new ec2.CfnEIP(this, 'TestAppNATEIP').attrAllocationId,
    });

    // Create Route Tables
    const publicRouteTable = new ec2.CfnRouteTable(this, 'TestAppPublicRouteTable', {
      vpcId: vpc.vpcId,
    });
    const privateRouteTable = new ec2.CfnRouteTable(this, 'TestAppPrivateRouteTable', {
      vpcId: vpc.vpcId,
    });

    // Add routes to Route Tables
    new ec2.CfnRoute(this, 'TestAppPublicRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: igw.ref,
    });
    new ec2.CfnRoute(this, 'TestAppPrivateRoute', {
      routeTableId: privateRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: ngw.ref,
    });

    // Associate Route Tables with Subnets
    vpc.publicSubnets.forEach((subnet, i) => {
      new ec2.CfnSubnetRouteTableAssociation(this, `TestAppPubRTAssociation${i}`, {
        subnetId: subnet.subnetId,
        routeTableId: publicRouteTable.ref,
      });
    });
    vpc.privateSubnets.forEach((subnet, i) => {
      new ec2.CfnSubnetRouteTableAssociation(this, `TestAppPrvRTAssociation${i}`, {
        subnetId: subnet.subnetId,
        routeTableId: privateRouteTable.ref,
      });
    });

    // Create a security group for the ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for public ALB',
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');

    // Create a security group for the EC2 instances
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for ECS',
    });
    ecsSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(8000), 'Allow HTTP traffic from ALB');
  }
}
